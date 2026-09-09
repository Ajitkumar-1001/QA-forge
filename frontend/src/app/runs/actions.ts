"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { createProjectForCaller } from "@/lib/repositories/project";
import { createScenarioForCaller, resolveCredentialForCaller } from "@/lib/repositories/test-scenario";
import { hasCapacityForCaller, startRunForCaller, recordRunResultForCaller } from "@/lib/repositories/test-run";
import { generateTestPlan, isPlanWellFormed, checkStepCountLimit } from "@/mastra/agents/test-planner.agent";
import { runQaInvestigation } from "@/mastra/workflows/qa-investigation.workflow";
import { ERROR_REASON_VALUES } from "@/db/enums";
import type { ErrorReason, Report, RunStatus } from "@/mastra/types";

const KNOWN_ERROR_REASONS: ReadonlySet<string> = new Set<string>(ERROR_REASON_VALUES);
function isKnownErrorReason(reason: string): reason is ErrorReason {
  return KNOWN_ERROR_REASONS.has(reason);
}

// data-model.md's state-transition note (also cli/run.ts): INCONCLUSIVE collapses to FAILED.
function runStatusForReportResult(result: "PASS" | "FAIL" | "INCONCLUSIVE"): RunStatus {
  return result === "PASS" ? "PASSED" : "FAILED";
}

export interface StartRunState {
  error: string | null;
}

// 006-run-concurrency-cap: shared by the early courtesy check and startRunForCaller's real,
// atomic backstop (below) — both paths must say the identical thing.
const RATE_LIMITED_MESSAGE = "You have 5 runs in progress already. Wait for one to finish before starting another.";

/**
 * 005-run-launch-ui: the UI-triggered equivalent of frontend/src/cli/run.ts's main() — same
 * sequence (project -> scenario -> run -> plan -> investigate -> record), same terminal
 * states (spec.md FR-002). callerId is resolved here, not trusted from any client input or
 * an earlier page-level check (Constitution III; research.md #1, quoting Next's own
 * "always verify authentication and authorization inside every Server Function").
 *
 * Signature is `(prevState, formData) => state`, not the plainer `(formData) => void` —
 * run-launch-form.tsx drives this via useActionState (tasks.md T007) so the form can show a
 * validation/config error inline instead of Next's generic error boundary. Every path that
 * has already created a test_run row still ends in `redirect()` regardless of outcome
 * (success and every terminal ERROR alike) — only the pre-row-creation paths return state.
 *
 * Execution model: synchronous, request-scoped — this action blocks for the investigation's
 * full duration, same as the CLI's own process does. A known, accepted, documented scope
 * boundary (research.md #2, spec.md Assumptions), not solved here.
 */
export async function startRunAction(_prevState: StartRunState, formData: FormData): Promise<StartRunState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "QAForge is not configured to run investigations yet. Try again later." };
  }

  // 006-run-concurrency-cap: checked before createProjectForCaller — a courtesy early-exit
  // (FR-001), not the enforcement boundary itself (see hasCapacityForCaller's own doc
  // comment and startRunForCaller's backstop below, which is what actually guarantees the
  // cap under real concurrent requests).
  if (!(await hasCapacityForCaller(callerId))) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const applicationUrl = String(formData.get("url") ?? "").trim();
  const repository = String(formData.get("repository") ?? "").trim();
  const objective = String(formData.get("objective") ?? "").trim();
  const credentialUsername = String(formData.get("credentialUsername") ?? "").trim();
  const credentialPassword = String(formData.get("credentialPassword") ?? "").trim();
  if (!applicationUrl || !repository || !objective) {
    return { error: "URL, repository, and objective are all required." };
  }
  // Combined into one opaque JSON string — the same {username,password} shape cli/run.ts's
  // QAFORGE_CREDENTIAL env var already uses — never logged, never assigned to a variable
  // that outlives resolveCredentialForCaller's single call below (FR-007).
  const credentialValue =
    credentialUsername || credentialPassword ? JSON.stringify({ username: credentialUsername, password: credentialPassword }) : undefined;

  // Fresh per submission — mirrors cli/run.ts's own crypto.randomUUID()-per-invocation.
  const runId = crypto.randomUUID();

  const project = await createProjectForCaller(callerId, { applicationUrl, repository });
  const scenario = await createScenarioForCaller(callerId, {
    projectId: project.id,
    objective,
    credentialsReference: null,
    credentialValue,
  });
  if ("ok" in scenario) {
    return { error: "Could not start the run. Please try again." };
  }

  const startedRun = await startRunForCaller(callerId, { scenarioId: scenario.id, idempotencyKey: runId });
  if ("ok" in startedRun) {
    // 006-run-concurrency-cap: a specific message for the cap, ahead of the generic
    // fallback that now only covers the remaining not_found_or_not_owned case.
    if (startedRun.reason === "RATE_LIMITED") {
      return { error: RATE_LIMITED_MESSAGE };
    }
    return { error: "Could not start the run. Please try again." };
  }
  const dbRunId = startedRun.run.id;

  try {
    let report: Report;
    // e2e-only test seam (tasks.md T013): a real investigation needs a real
    // ANTHROPIC_API_KEY and launches a real headless browser — neither belongs in an
    // automated E2E run. Set only by tests/e2e/run-launch-ui.e2e.ts's own dev-server
    // environment (see that file's header comment); unset in every real deployment, in
    // which case this branch never runs and behavior is identical to before this existed.
    if (process.env.QAFORGE_E2E_FAKE_REPORT) {
      report = JSON.parse(process.env.QAFORGE_E2E_FAKE_REPORT) as Report;
    } else {
      const plan = await generateTestPlan(objective);
      if (!isPlanWellFormed(plan)) {
        const message = plan.plannable
          ? "Test plan was marked plannable but its steps are malformed (empty action or expectedOutcome text)"
          : plan.reason;
        throw Object.assign(new Error(message), { reason: "OBJECTIVE_NOT_PLANNABLE" });
      }
      checkStepCountLimit(plan.steps.length);

      // Resolved once, immediately before the one call that needs it — never cached,
      // never assigned to a module- or request-outliving variable (FR-007). Stored value
      // is the same {username,password} JSON shape as cli/run.ts's QAFORGE_CREDENTIAL env
      // var; only .password is passed on, matching cli/run.ts exactly — the browser tool
      // layer (actions.tool.ts's `fill`) substitutes this single string into whichever
      // form field's accessible name looks password-like (CREDENTIAL_LIKE_KEY), and
      // evidence.tool.ts redacts this exact string everywhere it could leak into recorded
      // evidence. A JSON blob here would defeat both: it would never match a real field's
      // expected value, and redaction would search for the whole blob instead of the
      // plaintext secret itself.
      const resolvedCredential = await resolveCredentialForCaller(callerId, scenario.id);
      const credentialValueForInvestigation = resolvedCredential
        ? (JSON.parse(resolvedCredential) as { password?: string }).password
        : undefined;

      report = await runQaInvestigation({
        objective,
        applicationUrl,
        repoUrl: repository,
        githubToken: process.env.GITHUB_TOKEN,
        credentialValue: credentialValueForInvestigation,
        steps: plan.steps,
        runId,
      });
    }

    await recordRunResultForCaller(callerId, dbRunId, {
      status: runStatusForReportResult(report.result),
      errorReason: null,
      modelCalls: [],
      report,
    });
  } catch (error) {
    const reason = (error as { reason?: string } | undefined)?.reason;
    await recordRunResultForCaller(callerId, dbRunId, {
      status: "ERROR",
      errorReason: reason && isKnownErrorReason(reason) ? reason : null,
      modelCalls: [],
      report: null,
    }).catch((persistError: unknown) => {
      console.error("Failed to persist ERROR run status:", persistError);
    });
  }

  redirect(`/runs/${dbRunId}`);
}

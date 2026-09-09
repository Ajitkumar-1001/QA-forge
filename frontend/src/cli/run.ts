#!/usr/bin/env node

import {
  generateTestPlan,
  isPlanWellFormed,
  checkStepCountLimit,
} from "../mastra/agents/test-planner.agent";
import { runQaInvestigation } from "../mastra/workflows/qa-investigation.workflow";
import { logEvent } from "../mastra/observability";
import type { ErrorReason, Report, RunStatus } from "../mastra/types";
import { ERROR_REASON_VALUES } from "../db/enums";

type OutputFormat = "text" | "json";

function detectFormat(argv: string[]): OutputFormat {
  const index = argv.indexOf("--format");
  return index !== -1 && argv[index + 1] === "json" ? "json" : "text";
}

interface ParsedArgs {
  url: string;
  repo: string;
  objective: string;
  format: OutputFormat;
  maxSteps?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token?.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined) {
        throw Object.assign(new Error(`Missing value for --${key}`), { reason: "INVALID_ARGUMENT" });
      }
      flags[key] = value;
      i++;
    }
  }

  if (!flags.url || !flags.repo || !flags.objective) {
    throw Object.assign(
      new Error(
        'Usage: qaforge --url <url> --repo <owner/repo> --objective "<objective>" [--format text|json] [--max-steps <n>]',
      ),
      { reason: "INVALID_ARGUMENT" },
    );
  }

  return {
    url: flags.url,
    repo: flags.repo,
    objective: flags.objective,
    format: flags.format === "json" ? "json" : "text",
    maxSteps: flags["max-steps"] ? Number(flags["max-steps"]) : undefined,
  };
}

function reportError(format: OutputFormat, reason: string, message: string): void {

  process.stderr.write(`${reason}: ${message}\n`);
  if (format === "json") {
    console.log(JSON.stringify({ error: { reason, message } }));
  } else {
    console.log(`QAFORGE ERROR (${reason}): ${message}`);
  }
}

function formatReportText(objective: string, report: Report): string {
  const lines: string[] = [`QAFORGE INVESTIGATION — ${report.result}`, "", `Objective: ${objective}`, ""];

  report.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.action.padEnd(30)} ${step.status}`);
  });

  if (report.result === "FAIL") {
    const winning = report.hypotheses.find((h) => h.id === report.winningHypothesisId);
    lines.push("", `ROOT CAUSE (confidence ${report.confidence?.toFixed(2)})`, winning?.description ?? "");
  } else if (report.result === "INCONCLUSIVE") {

    const allRejected = report.hypotheses.every((h) => h.status === "REJECTED");
    lines.push(
      "",
      allRejected
        ? "NO CONFIRMED ROOT CAUSE — every hypothesis was ruled out:"
        : "NO CONFIRMED ROOT CAUSE — no hypothesis was confirmed (some ruled out, some left unresolved):",
    );
    for (const hypothesis of report.hypotheses) {
      lines.push(`  [${hypothesis.status}] ${hypothesis.description}`);
    }
  }

  if (report.result !== "PASS") {
    lines.push("", `Evidence: ${report.evidence.length} item(s).`);
  }

  return lines.join("\n");
}

function exitCodeForResult(result: Report["result"]): number {
  switch (result) {
    case "PASS":
      return 0;
    case "FAIL":
      return 1;
    case "INCONCLUSIVE":
      return 2;
  }
}

// data-model.md's state-transition note: Report.result's three-way PASS/FAIL/INCONCLUSIVE
// distinction collapses to TestRun.status's terminal two-way PASSED/FAILED — INCONCLUSIVE
// maps to FAILED (the run finished and needs a human's attention), matching PRD §15's own
// reasoning for why TestRun.status doesn't need a fourth value.
function runStatusForReportResult(result: Report["result"]): RunStatus {
  return result === "PASS" ? "PASSED" : "FAILED";
}

// Sourced directly from db/enums.ts — not a hand-typed copy, so a future ErrorReason
// value added there is automatically known here too (a `satisfies` copy would silently
// stay stale on addition; only removal would fail typecheck).
// 006-run-concurrency-cap: shared by the early courtesy check and startRunForCaller's real,
// atomic backstop (below) — both paths must say the identical thing (also actions.ts's own
// copy for the web UI, tasks.md T004).
const RATE_LIMITED_MESSAGE = "You have 5 runs in progress already. Wait for one to finish before starting another.";

const KNOWN_ERROR_REASONS: ReadonlySet<string> = new Set<string>(ERROR_REASON_VALUES);

function isKnownErrorReason(reason: string): reason is ErrorReason {
  return KNOWN_ERROR_REASONS.has(reason);
}

// Set once a test_run row exists (touch point 1) so the top-level .catch() below (touch
// point 3) can persist an ERROR status for it — main()'s own locals aren't visible there.
let currentRun: { callerId: string; dbRunId: string } | undefined;
let recordRunResultForCallerFn: typeof import("../lib/repositories/test-run").recordRunResultForCaller | undefined;

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not set"), { reason: "MISSING_API_KEY" });
  }

  const credentialJson = process.env.QAFORGE_CREDENTIAL;
  let credentialValue: string | undefined;
  if (credentialJson) {
    try {
      const parsed = JSON.parse(credentialJson) as { password?: string };
      credentialValue = parsed.password;
    } catch {
      throw Object.assign(new Error("QAFORGE_CREDENTIAL is not valid JSON"), {
        reason: "INVALID_ARGUMENT",
      });
    }
  }

  const callerId = process.env.QAFORGE_USER_ID;
  if (!callerId) {
    throw Object.assign(new Error("QAFORGE_USER_ID is not set"), { reason: "MISSING_USER_ID" });
  }

  // Fresh per invocation — this is the CLI's sole runId generation, reused as both 001's
  // internal workflow-scoped run id and FR-007's idempotency key. True retry-safety (the
  // same key across two separate invocations) isn't exercised by the CLI itself, only by
  // a future caller that persists and replays a key (research.md #4).
  const runId = crypto.randomUUID();

  // Deferred until every cheap, DB-free check above has passed — importing these earlier
  // would require DATABASE_URL just to validate args/env vars, breaking
  // contracts/cli-contract.md's exit-3-before-any-external-resource contract
  // (tests/integration/cli-contract.test.ts spawns the real CLI and checks exactly this).
  const { createProjectForCaller } = await import("../lib/repositories/project");
  const { createScenarioForCaller } = await import("../lib/repositories/test-scenario");
  const { hasCapacityForCaller, startRunForCaller, recordRunResultForCaller } = await import("../lib/repositories/test-run");
  recordRunResultForCallerFn = recordRunResultForCaller;

  // 006-run-concurrency-cap: checked before createProjectForCaller — a courtesy early-exit
  // (FR-001), not the enforcement boundary itself (see hasCapacityForCaller's own doc
  // comment and startRunForCaller's backstop below, which is what actually guarantees the
  // cap under real concurrent requests).
  if (!(await hasCapacityForCaller(callerId))) {
    throw Object.assign(new Error(RATE_LIMITED_MESSAGE), { reason: "RATE_LIMITED" });
  }

  const project = await createProjectForCaller(callerId, { applicationUrl: args.url, repository: args.repo });
  const scenario = await createScenarioForCaller(callerId, {
    projectId: project.id,
    objective: args.objective,
    // No real secrets-manager integration exists yet (D2, out of scope for 001 and this
    // feature) — this records only that a credential was supplied, never the value itself
    // (FR-011). Not a resolvable pointer; a future feature building D2 replaces it with one.
    credentialsReference: credentialValue ? "cli-env:QAFORGE_CREDENTIAL" : null,
  });
  if ("ok" in scenario) {
    throw Object.assign(new Error("Failed to create scenario for the resolved caller"), { reason: "UNKNOWN_ERROR" });
  }

  const startedRun = await startRunForCaller(callerId, { scenarioId: scenario.id, idempotencyKey: runId });
  if ("ok" in startedRun) {
    if (startedRun.reason === "RATE_LIMITED") {
      throw Object.assign(new Error(RATE_LIMITED_MESSAGE), { reason: "RATE_LIMITED" });
    }
    throw Object.assign(new Error("Failed to start run for the resolved caller"), { reason: "UNKNOWN_ERROR" });
  }
  const dbRunId = startedRun.run.id;
  currentRun = { callerId, dbRunId };

  const plan = await generateTestPlan(args.objective);

  if (!isPlanWellFormed(plan)) {
    const message = plan.plannable
      ? "Test plan was marked plannable but its steps are malformed (empty action or expectedOutcome text)"
      : plan.reason;
    throw Object.assign(new Error(message), { reason: "OBJECTIVE_NOT_PLANNABLE" });
  }
  checkStepCountLimit(plan.steps.length);

  const report = await runQaInvestigation({
    objective: args.objective,
    applicationUrl: args.url,
    repoUrl: args.repo,
    githubToken: process.env.GITHUB_TOKEN,
    credentialValue,
    steps: plan.steps,
    maxIterations: args.maxSteps,
    runId,
  });

  // Durable write, additive alongside the existing console output below (FR-003) — neither
  // depends on the other having happened first. modelCalls is always [] today: nothing in
  // 001's agents constructs a ModelCall value yet (research.md #7, a known, separate gap).
  const recorded = await recordRunResultForCaller(callerId, dbRunId, {
    status: runStatusForReportResult(report.result),
    errorReason: null,
    modelCalls: [],
    report,
  });
  if (!recorded.ok) {
    // Ownership can't realistically have changed between startRunForCaller and here within
    // one process's lifetime, but surface it rather than silently printing the report as if
    // the durable write had succeeded.
    console.error(`Failed to record run result: ${recorded.reason}`);
  }

  logEvent({
    type: "terminal",
    runId,
    result: report.result,
    rootCauseConfirmed: report.result === "FAIL",
    hypothesesEvidenceCited: report.hypotheses.map((hypothesis) => ({
      hypothesisId: hypothesis.id,
      hasCitedEvidence: hypothesis.evidenceLinks.length > 0,
    })),
  });

  if (args.format === "json") {
    console.log(JSON.stringify(report));
  } else {
    console.log(formatReportText(args.objective, report));
  }
  process.exitCode = exitCodeForResult(report.result);
}

// Extracted so tests can invoke the exact same fatal-error handling main().catch() runs in
// production (report to stderr, set exit code 3, best-effort persist ERROR status) without
// having to reimplement it.
export async function handleFatalError(error: unknown): Promise<void> {
  const format = detectFormat(process.argv.slice(2));
  const reason = (error as { reason?: string })?.reason ?? "UNKNOWN_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  reportError(format, reason, message);
  process.exitCode = 3;

  // Persists OBJECTIVE_NOT_PLANNABLE and every other pre-completion failure as a real
  // ERROR run instead of only ever appearing as stderr output. Also fires — safely, as a
  // no-op — when the report-recording call above already succeeded and something
  // unrelated threw afterward (research.md #5: recordRunResultForCaller no-ops on an
  // already-terminal run rather than crashing on report.run_id's UNIQUE constraint).
  if (currentRun && recordRunResultForCallerFn) {
    // test_run.error_reason's pgEnum only allows 001's 5 real ErrorReason values (FR-012)
    // — a generic failure with no matching reason (e.g. "UNKNOWN_ERROR") is stored as null
    // rather than misattributed to one of the 5, since the DB constraint would reject an
    // unlisted value outright and null is itself a valid, honest "unclassified" state
    // (data-model.md: non-null only when status = 'ERROR', never required to be non-null).
    const errorReason = isKnownErrorReason(reason) ? reason : null;
    await recordRunResultForCallerFn(currentRun.callerId, currentRun.dbRunId, {
      status: "ERROR",
      errorReason,
      modelCalls: [],
      report: null,
    }).catch((persistError: unknown) => {
      // Never let a failure to persist the ERROR status mask the original error already
      // reported above — this is best-effort, not a second chance to change the exit code.
      console.error("Failed to persist ERROR run status:", persistError);
    });
  }
}

// Only run as the process entry point — not when imported (e.g. by
// tests/unit/cli-run-persistence.test.ts, which calls main()/handleFatalError() directly
// against a mocked DB instead of spawning a real subprocess).
function isEntryPoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
}

if (isEntryPoint()) {
  main().catch(handleFatalError);
}

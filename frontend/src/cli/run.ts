#!/usr/bin/env node

import { generateTestPlan, isPlanWellFormed } from "../mastra/agents/test-planner.agent";
import { runQaInvestigation } from "../mastra/workflows/qa-investigation.workflow";
import { logEvent } from "../mastra/observability";
import type { Report } from "../mastra/types";

/**
 * CLI entrypoint (contracts/cli-contract.md). T018 built the skeleton (arg parsing, env var
 * reads, error-to-exit-code mapping); this wires in the actual test-plan generation and workflow
 * invocation, and prints the Report per `--format text`/`--format json` (FR-012).
 */

type OutputFormat = "text" | "json";

/**
 * NFR-001's "total steps" bound — previously entirely unenforced (T060, 2026-09-04
 * /speckit-converge): the test-plan schema allowed unlimited steps, and nothing capped the
 * execution loop. A Recommendation-tier default (PRD §20 states its execution limits as examples,
 * not yet load-tested numbers) — the behavior (a bound exists) is the requirement, not this exact
 * number. Distinct from `--max-steps` below, which actually bounds the investigation loop's own
 * round-trips ("max agent loops"), not the count of planned scenario steps — a documentation
 * mismatch corrected in contracts/cli-contract.md alongside this fix.
 */
const MAX_PLANNED_STEPS = 40;

export function checkStepCountLimit(stepCount: number): void {
  if (stepCount > MAX_PLANNED_STEPS) {
    throw Object.assign(
      new Error(`Test plan has ${stepCount} steps, exceeding the ${MAX_PLANNED_STEPS}-step limit`),
      { reason: "LIMIT_EXCEEDED" as const },
    );
  }
}

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
  // Always also on stderr, so a truncated/piped stdout doesn't lose it (contracts/cli-contract.md).
  process.stderr.write(`${reason}: ${message}\n`);
  if (format === "json") {
    console.log(JSON.stringify({ error: { reason, message } }));
  } else {
    console.log(`QAFORGE ERROR (${reason}): ${message}`);
  }
}

/** PRD §17's per-state mockups, adapted for console output (contracts/cli-contract.md). */
function formatReportText(objective: string, report: Report): string {
  const lines: string[] = [`QAFORGE INVESTIGATION — ${report.result}`, "", `Objective: ${objective}`, ""];

  report.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.action.padEnd(30)} ${step.status}`);
  });

  if (report.result === "FAIL") {
    const winning = report.hypotheses.find((h) => h.id === report.winningHypothesisId);
    lines.push("", `ROOT CAUSE (confidence ${report.confidence?.toFixed(2)})`, winning?.description ?? "");
  } else if (report.result === "INCONCLUSIVE") {
    lines.push("", "NO CONFIRMED ROOT CAUSE — every hypothesis was ruled out:");
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

async function main(): Promise<void> {
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

  const plan = await generateTestPlan(args.objective);
  // T052, 2026-09-04 /speckit-converge (CRITICAL, Constitution I): code re-verifies plannability
  // independently rather than trusting plan.plannable directly — a plan that claims plannable but
  // isn't actually well-formed is downgraded here, not passed through on the model's own say-so.
  if (!isPlanWellFormed(plan)) {
    const message = plan.plannable
      ? "Test plan was marked plannable but its steps are malformed (empty action or expectedOutcome text)"
      : plan.reason;
    throw Object.assign(new Error(message), { reason: "OBJECTIVE_NOT_PLANNABLE" });
  }
  checkStepCountLimit(plan.steps.length);

  const runId = crypto.randomUUID();
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
  // T061, 2026-09-04 /speckit-converge (NFR-005): observability.ts was built but never called from
  // anywhere until this fix. Logs the run's own outcome plus, per hypothesis, whether it carries a
  // cited evidence source — NFR-005's three named metrics.
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

main().catch((error: unknown) => {
  const format = detectFormat(process.argv.slice(2));
  const reason = (error as { reason?: string })?.reason ?? "UNKNOWN_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  reportError(format, reason, message);
  process.exitCode = 3;
});

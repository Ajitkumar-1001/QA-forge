import type { Report } from "@/mastra/types";
import type { Hypothesis } from "@/mastra/schemas/hypothesis.schema";

/**
 * Deterministic string templating from the Report's own structured fields (Constitution
 * Principle I; PRD's /speckit-clarify framing: "Report already supplies everything needed
 * for templating"), not an LLM call — this also means the hidden marker below is composed
 * without ever handing target-app/repo-sourced content (Principle II's "untrusted input")
 * to an LLM prompt, sidestepping the prompt-injection concern the vault's plan-eng-review
 * stage flags for the alternative (LLM-drafted) design.
 *
 * Lives here, not in src/lib/repositories/, because it does no database access — it has no
 * callerId to scope a query by, so it isn't subject to SEC-009 (callerId-first-param). Its
 * one caller, createApprovalDraftForCaller in src/lib/repositories/approval.ts, is the
 * repository method that owns the actual ownership-scoped INSERT.
 */
export function buildApprovalDraft(
  approvalId: string,
  runId: string,
  runInfo: { objective: string; repository: string; applicationUrl: string },
  report: Report,
  winningHypothesis: Hypothesis | undefined,
): { title: string; body: string } {
  const title = (
    winningHypothesis
      ? `QAForge: ${winningHypothesis.description}`
      : `QAForge investigation ${report.result === "INCONCLUSIVE" ? "was inconclusive" : "failed"}: ${runInfo.objective}`
  ).slice(0, 250);

  const failedSteps = report.steps.filter((s) => s.status === "FAILED");
  const stepsSection =
    failedSteps.length > 0
      ? failedSteps.map((s) => `- **${s.action}** — expected: ${s.expectedOutcome}${s.observed ? `; observed: ${s.observed}` : ""}`).join("\n")
      : "_No individual step recorded a failure; see the root cause below._";

  const body = [
    `QAForge investigated **${runInfo.objective}** against \`${runInfo.applicationUrl}\` (\`${runInfo.repository}\`) and produced a **${report.result}** result${report.confidence !== null ? ` (confidence ${report.confidence.toFixed(2)})` : ""}.`,
    "",
    "## Root cause",
    winningHypothesis ? winningHypothesis.description : "No hypothesis reached SUPPORTED status.",
    "",
    "## Failed steps",
    stepsSection,
    "",
    `_Run: ${runId}_`,
    `<!-- qaforge-approval:${approvalId} -->`,
  ].join("\n");

  return { title, body };
}

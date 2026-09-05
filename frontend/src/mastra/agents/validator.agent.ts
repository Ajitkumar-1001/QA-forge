import { Agent } from "@mastra/core/agent";
import { generateValidated, validatorModel } from "../llm";
import { validatorOutputSchema, type ValidationCheck } from "../schemas/validation.schema";
import type { StepCriterion } from "../schemas/step-criterion.schema";
import type {
  Hypothesis,
  HypothesisCandidate,
  HypothesisStatus,
} from "../schemas/hypothesis.schema";
import type { Evidence } from "../types";
import { toPromptContext, type ToolResult } from "../prompt-context";

/** PRD §9.7's recommended bar — a Recommendation, not yet load-tested; the behavior (a bar
 * exists and every check must pass) is the requirement, not this exact number. */
const CONFIDENCE_BAR = 0.7;

export const validatorAgent = new Agent({
  id: "validator",
  name: "Validator",
  instructions: [
    "You attempt to falsify a candidate root-cause hypothesis. Propose checks against the cited",
    "evidence: prefer a 'structured' check (a predicate — a URL match, an accessibility-role",
    "selector's presence or absence, an HTTP status, or a console-message absence pattern — that",
    "code will evaluate directly against the evidence) whenever the assertion reduces to one. Only",
    "use a 'semantic' check, with your own honest passed/failed judgment, for assertions that",
    "genuinely can't be expressed as one of those predicates. Never claim a structured predicate",
    "is true yourself — propose it as a structured check and let code decide.",
  ].join(" "),
  model: validatorModel,
});

/** Code — not the LLM's holistic judgment — decides whether a single check holds (Constitution
 * Principle I). Content matching is string-based against `Evidence.content`, a deliberate
 * simplification over a full DOM/HTTP parser — sufficient for the closed-form StepCriterion
 * shapes this feature defines. */
function evaluateCriterion(criterion: StepCriterion, content: string): boolean {
  switch (criterion.kind) {
    case "url":
      return content.includes(criterion.match);
    case "selectorPresent":
      return content.includes(criterion.selector);
    case "selectorAbsent":
      return !content.includes(criterion.selector);
    case "consoleAbsent":
      return !new RegExp(criterion.pattern).test(content);
    case "httpStatus": {
      const match = content.match(/"status":\s*(\d+)/);
      const status = match?.[1] ? Number(match[1]) : null;
      if (status === null) return false;
      if (criterion.in) return criterion.in.includes(status);
      if (criterion.notIn) return !criterion.notIn.includes(status);
      return true;
    }
  }
}

function checkPasses(check: ValidationCheck, evidenceById: Map<string, Evidence>): boolean {
  if (check.kind === "semantic") return check.passed;
  const evidence = evidenceById.get(check.evidenceId);
  if (!evidence) return false;
  return evaluateCriterion(check.criterion, evidence.content);
}

/**
 * Code decides SUPPORTED/REJECTED/VALIDATING from the checks the Validator Agent proposed
 * (FR-010, Constitution Principle I) — `status = REJECTED` iff any check fails; `SUPPORTED` iff
 * every check passes AND the confidence bar is met; otherwise the hypothesis stays non-terminal
 * (data-model.md).
 */
export function evaluateHypothesis(
  candidate: HypothesisCandidate,
  checks: ValidationCheck[],
  evidenceById: Map<string, Evidence>,
): Hypothesis {
  const results = checks.map((check) => checkPasses(check, evidenceById));
  const anyFailed = results.some((passed) => !passed);
  const allPassed = results.every((passed) => passed);

  let status: HypothesisStatus;
  if (anyFailed) {
    status = "REJECTED";
  } else if (allPassed && candidate.confidence >= CONFIDENCE_BAR) {
    status = "SUPPORTED";
  } else {
    status = "VALIDATING";
  }

  return { id: crypto.randomUUID(), ...candidate, status, checks };
}

/**
 * The Validator Agent's structured-output call (FR-010) — proposes checks only.
 * `evaluateHypothesis` above is where code, not the model, decides the verdict.
 */
export async function proposeChecks(
  candidate: HypothesisCandidate,
  evidence: ToolResult[],
): Promise<ValidationCheck[]> {
  const prompt = [
    `Hypothesis to falsify: ${candidate.description}`,
    "Cited evidence:",
    ...evidence.map(toPromptContext),
  ].join("\n\n");
  const output = await generateValidated(validatorAgent, prompt, validatorOutputSchema);
  return output.checks;
}

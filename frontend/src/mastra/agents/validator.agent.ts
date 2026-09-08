import { Agent } from "@mastra/core/agent";
import { generateValidated, validatorModel } from "../llm";
import {
  validatorOutputSchema,
  type ValidationCheck,
  type EvaluatedCheck,
} from "../schemas/validation.schema";
import type { StepCriterion } from "../schemas/step-criterion.schema";
import type {
  Hypothesis,
  HypothesisCandidate,
  HypothesisStatus,
} from "../schemas/hypothesis.schema";
import type { Evidence } from "../types";
import { toPromptContext, type ToolResult } from "../prompt-context";

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
    "is true yourself — propose it as a structured check and let code decide. Each piece of",
    "evidence below is labeled with its own EVIDENCE_ID line — set evidenceId to that exact string",
    "for whichever evidence the check is against, never a description or a made-up id.",
  ].join(" "),
  model: validatorModel,
});

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

export function evaluateHypothesis(
  candidate: HypothesisCandidate,
  checks: ValidationCheck[],
  evidenceById: Map<string, Evidence>,
): Hypothesis {
  const evaluated: EvaluatedCheck[] = checks.map((check) => ({
    check,
    passed: checkPasses(check, evidenceById),
  }));
  const anyFailed = evaluated.some((e) => !e.passed);
  const allPassed = evaluated.every((e) => e.passed);
  const hasStructuredCheck = checks.some((check) => check.kind === "structured");

  let status: HypothesisStatus;
  if (!hasStructuredCheck) {
    status = "VALIDATING";
  } else if (anyFailed) {
    status = "REJECTED";
  } else if (allPassed && candidate.confidence >= CONFIDENCE_BAR) {
    status = "SUPPORTED";
  } else {
    status = "VALIDATING";
  }

  return { id: crypto.randomUUID(), ...candidate, status, checks: evaluated };
}

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

import { z } from "zod";
import { stepCriterionSchema } from "./step-criterion.schema";

/**
 * FR-010, Constitution Principle I. Discriminates code-evaluated ("structured") checks — the
 * model proposes WHAT to check via a StepCriterion predicate, code decides WHETHER it's true —
 * from genuinely judgment-based ("semantic") checks, where the model's own `passed` is honestly
 * trusted. `passed` does not exist on the `structured` branch — the model cannot assert its own
 * verdict there (data-model.md, strengthened 2026-09-04).
 */
export const validationCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("structured"),
    evidenceId: z.string(),
    criterion: stepCriterionSchema,
  }),
  z.object({
    kind: z.literal("semantic"),
    evidenceId: z.string(),
    assertion: z.string(),
    passed: z.boolean(),
  }),
]);

export type ValidationCheck = z.infer<typeof validationCheckSchema>;

/** What the Validator Agent emits per hypothesis (FR-010) — checks only, never a SUPPORTED/
 * REJECTED verdict field itself; `validator.agent.ts`'s `evaluateHypothesis` decides that. */
export const validatorOutputSchema = z.object({
  checks: z.array(validationCheckSchema).min(1),
});

export type ValidatorOutput = z.infer<typeof validatorOutputSchema>;

/**
 * A proposed check paired with code's own evaluated outcome (T059, 2026-09-04 `/speckit-converge`)
 * — `passed` here is always code-computed (`checkPasses`, validator.agent.ts), never the model's
 * own self-report, even for a `semantic` check whose own `passed` field is the model's claim being
 * evaluated, not the recorded outcome. Keeps Constitution I's code-decides boundary visible in the
 * type: `Hypothesis.checks` carries this shape, not a bare `ValidationCheck[]`, so a REJECTED
 * hypothesis's report data can state which check(s) actually failed and why.
 */
export interface EvaluatedCheck {
  check: ValidationCheck;
  passed: boolean;
}

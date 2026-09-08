import { z } from "zod";
import { stepCriterionSchema } from "./step-criterion.schema";

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

export const validatorOutputSchema = z.object({
  checks: z.array(validationCheckSchema).min(1),
});

export type ValidatorOutput = z.infer<typeof validatorOutputSchema>;

export interface EvaluatedCheck {
  check: ValidationCheck;
  passed: boolean;
}

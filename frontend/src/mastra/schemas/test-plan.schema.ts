import { z } from "zod";
import { stepCriterionSchema } from "./step-criterion.schema";

const plannedStepSchema = z.object({
  position: z.number().int().nonnegative(),
  action: z.string(),
  expectedOutcome: z.string(),
  successCriteria: stepCriterionSchema,
  failureCriteria: stepCriterionSchema,
});

/**
 * The Test Planner Agent's structured output (FR-002, PRD §9.2). `plannable: false` is the
 * explicit "can't decompose this objective" branch — the harness MUST report this rather than
 * executing a best-guess plan (Constitution Principle I).
 */
export const testPlanSchema = z.discriminatedUnion("plannable", [
  z.object({ plannable: z.literal(false), reason: z.string() }),
  z.object({ plannable: z.literal(true), steps: z.array(plannedStepSchema).min(1) }),
]);

export type PlannedStep = z.infer<typeof plannedStepSchema>;
export type TestPlan = z.infer<typeof testPlanSchema>;

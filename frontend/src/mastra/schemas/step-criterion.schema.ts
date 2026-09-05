import { z } from "zod";

/**
 * Closed-form, deterministic step success/failure criterion (FR-002, PRD §9.2, data-model.md).
 * `selectorPresent`/`selectorAbsent` are distinct discriminant values — the original PRD union
 * shared one `kind: 'selector'` value between both cases, which a discriminated union (and a
 * provider's JSON-schema constraint) can't distinguish (research.md §5).
 */
export const stepCriterionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), match: z.string() }),
  z.object({ kind: z.literal("selectorPresent"), selector: z.string() }),
  z.object({ kind: z.literal("selectorAbsent"), selector: z.string() }),
  z.object({
    kind: z.literal("httpStatus"),
    path: z.string().optional(),
    in: z.array(z.number()).optional(),
    notIn: z.array(z.number()).optional(),
  }),
  z.object({ kind: z.literal("consoleAbsent"), pattern: z.string() }),
]);

export type StepCriterion = z.infer<typeof stepCriterionSchema>;

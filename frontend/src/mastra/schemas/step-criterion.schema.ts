import { z } from "zod";

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

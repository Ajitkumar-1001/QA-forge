import { describe, expect, it } from "vitest";
import { stepCriterionSchema } from "@/mastra/schemas/step-criterion.schema";

describe("stepCriterionSchema (FR-002)", () => {
  it("accepts a url criterion", () => {
    expect(stepCriterionSchema.safeParse({ kind: "url", match: "/dashboard" }).success).toBe(true);
  });

  it("accepts selectorPresent and selectorAbsent as distinct discriminants (the fix)", () => {
    expect(
      stepCriterionSchema.safeParse({ kind: "selectorPresent", selector: "role=heading" }).success,
    ).toBe(true);
    expect(
      stepCriterionSchema.safeParse({ kind: "selectorAbsent", selector: "role=alert" }).success,
    ).toBe(true);
  });

  it("rejects the original buggy shared-discriminant 'selector' shape", () => {
    expect(stepCriterionSchema.safeParse({ kind: "selector", present: true }).success).toBe(false);
    expect(stepCriterionSchema.safeParse({ kind: "selector", absent: true }).success).toBe(false);
  });

  it("accepts an httpStatus criterion with only 'in' or only 'notIn'", () => {
    expect(stepCriterionSchema.safeParse({ kind: "httpStatus", in: [200, 201] }).success).toBe(true);
    expect(stepCriterionSchema.safeParse({ kind: "httpStatus", notIn: [500] }).success).toBe(true);
  });

  it("accepts a consoleAbsent criterion", () => {
    expect(
      stepCriterionSchema.safeParse({ kind: "consoleAbsent", pattern: "Uncaught" }).success,
    ).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(stepCriterionSchema.safeParse({ kind: "somethingElse" }).success).toBe(false);
  });

  it("rejects a criterion missing its required field", () => {
    expect(stepCriterionSchema.safeParse({ kind: "url" }).success).toBe(false);
    expect(stepCriterionSchema.safeParse({ kind: "selectorPresent" }).success).toBe(false);
  });
});

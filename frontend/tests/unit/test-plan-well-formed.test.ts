import { describe, expect, it } from "vitest";
import { isPlanWellFormed, checkStepCountLimit, MAX_PLANNED_STEPS } from "@/mastra/agents/test-planner.agent";
import type { TestPlan } from "@/mastra/schemas/test-plan.schema";

/**
 * T052, 2026-09-04 /speckit-converge (CRITICAL, Constitution I) — plannability was previously a
 * bare echo of the model's own `plannable` claim. `isPlanWellFormed` is the deterministic
 * re-derivation; these tests exercise it directly (no LLM needed — a pure function).
 */
const STEP = {
  position: 0,
  action: "Click the login button",
  expectedOutcome: "The dashboard loads",
  successCriteria: { kind: "url" as const, match: "/dashboard" },
  failureCriteria: { kind: "url" as const, match: "/login" },
};

describe("isPlanWellFormed", () => {
  it("accepts a plannable plan with at least one well-formed step", () => {
    const plan: TestPlan = { plannable: true, steps: [STEP] };
    expect(isPlanWellFormed(plan)).toBe(true);
  });

  it("rejects a plan the model marked unplannable", () => {
    const plan: TestPlan = { plannable: false, reason: "Objective is too vague" };
    expect(isPlanWellFormed(plan)).toBe(false);
  });

  it("does not just echo plannable: true — rejects malformed steps regardless of the model's own claim", () => {
    const plan: TestPlan = {
      plannable: true,
      steps: [{ ...STEP, action: "   " }],
    };
    expect(isPlanWellFormed(plan)).toBe(false);
  });

  it("rejects an empty expectedOutcome the same way", () => {
    const plan: TestPlan = {
      plannable: true,
      steps: [{ ...STEP, expectedOutcome: "" }],
    };
    expect(isPlanWellFormed(plan)).toBe(false);
  });
});

/** T060, 2026-09-04 /speckit-converge (NFR-001) — "total steps" was previously entirely
 * unenforced. */
describe("checkStepCountLimit", () => {
  it("does not throw at or under the limit", () => {
    expect(() => checkStepCountLimit(MAX_PLANNED_STEPS)).not.toThrow();
  });

  it("throws a LIMIT_EXCEEDED-reasoned error over the limit", () => {
    expect(() => checkStepCountLimit(MAX_PLANNED_STEPS + 1)).toThrow(
      expect.objectContaining({ reason: "LIMIT_EXCEEDED" }),
    );
  });
});

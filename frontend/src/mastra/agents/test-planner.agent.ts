import { Agent } from "@mastra/core/agent";
import { plannerModel, generateValidated } from "../llm";
import { testPlanSchema, type TestPlan } from "../schemas/test-plan.schema";

export const testPlannerAgent = new Agent({
  id: "test-planner",
  name: "Test Planner",
  instructions: [
    "You convert a natural-language QA objective into a test plan: a sequence of steps, each",
    "with a deterministic, closed-form success criterion and failure criterion (a URL match, an",
    "accessibility-role selector's presence or absence, an HTTP status, or a console-message",
    "absence pattern). If the objective cannot be decomposed into such steps — too vague,",
    "contradictory, or outside what a browser scenario can check — set plannable to false and",
    "explain why in one sentence, rather than guessing a plan.",
  ].join(" "),
  model: plannerModel,
});

/**
 * FR-002: converts a natural-language objective into a `TestPlan`. `plannable: false` is the
 * explicit short-circuit — the harness reports this rather than executing a best-guess plan
 * (Constitution Principle I).
 */
export async function generateTestPlan(objective: string): Promise<TestPlan> {
  return generateValidated(testPlannerAgent, `Objective: ${objective}`, testPlanSchema);
}

/**
 * Constitution I: plannability is a terminal outcome and MUST be decided by code, not merely
 * echoed from the model's own `plannable` claim. Independently re-verifies a `plannable: true`
 * plan is actually well-formed — at least one step, each with non-empty action/expectedOutcome
 * text — before the caller trusts it; a plan failing this check is treated as unplannable
 * regardless of what the model asserted (T052, 2026-09-04 `/speckit-converge`, CRITICAL). The
 * schema's own `.min(1)` on `steps` already rules out an empty array, but says nothing about
 * empty-string field values, which zod's bare `z.string()` allows through.
 */
export function isPlanWellFormed(plan: TestPlan): plan is Extract<TestPlan, { plannable: true }> {
  if (!plan.plannable) return false;
  return (
    plan.steps.length > 0 &&
    plan.steps.every((step) => step.action.trim().length > 0 && step.expectedOutcome.trim().length > 0)
  );
}

/**
 * NFR-001's "total steps" bound — previously entirely unenforced (T060, 2026-09-04
 * /speckit-converge): the test-plan schema allowed unlimited steps, and nothing capped the
 * execution loop. A Recommendation-tier default (PRD §20 states its execution limits as examples,
 * not yet load-tested numbers) — the behavior (a bound exists) is the requirement, not this exact
 * number. Distinct from `--max-steps` (contracts/cli-contract.md), which bounds the investigation
 * loop's own round-trips ("max agent loops"), not the count of planned scenario steps.
 */
export const MAX_PLANNED_STEPS = 40;

export function checkStepCountLimit(stepCount: number): void {
  if (stepCount > MAX_PLANNED_STEPS) {
    throw Object.assign(
      new Error(`Test plan has ${stepCount} steps, exceeding the ${MAX_PLANNED_STEPS}-step limit`),
      { reason: "LIMIT_EXCEEDED" as const },
    );
  }
}

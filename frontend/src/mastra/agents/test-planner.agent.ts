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

export async function generateTestPlan(objective: string): Promise<TestPlan> {
  return generateValidated(testPlannerAgent, `Objective: ${objective}`, testPlanSchema);
}

export function isPlanWellFormed(plan: TestPlan): plan is Extract<TestPlan, { plannable: true }> {
  if (!plan.plannable) return false;
  return (
    plan.steps.length > 0 &&
    plan.steps.every((step) => step.action.trim().length > 0 && step.expectedOutcome.trim().length > 0)
  );
}

export const MAX_PLANNED_STEPS = 40;

export function checkStepCountLimit(stepCount: number): void {
  if (stepCount > MAX_PLANNED_STEPS) {
    throw Object.assign(
      new Error(`Test plan has ${stepCount} steps, exceeding the ${MAX_PLANNED_STEPS}-step limit`),
      { reason: "LIMIT_EXCEEDED" as const },
    );
  }
}

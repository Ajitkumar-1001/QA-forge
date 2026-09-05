import { Agent } from "@mastra/core/agent";
import { plannerModel, generateValidated } from "../llm";
import { testPlanSchema, type TestPlan } from "../schemas/test-plan.schema";

const testPlannerAgent = new Agent({
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

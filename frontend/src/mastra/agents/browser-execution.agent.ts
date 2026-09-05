import { Agent } from "@mastra/core/agent";
import type { Page } from "playwright";
import { browserExecutionModel } from "../llm";
import { createActionTools } from "../tools/browser/actions.tool";

/** "Max browser steps"/"max retries per step" (PRD §20) — a distinct axis from the
 * investigation loop's "max agent loops" (NFR-001, research.md §2). */
const MAX_TOOL_CALLS_PER_STEP = 8;

/**
 * The multi-step tool-calling loop over `actions.tool.ts` (PRD §9.3, FR-003). Given a Step's
 * action text and the current page's ariaSnapshot, selects among click/fill/submit/wait and calls
 * one or more of them — an action like "Enter credentials and submit" needs several tool calls
 * (fill, fill, submit), which is exactly what Mastra's own agentic tool-calling loop provides,
 * bounded by `maxSteps`. If nothing resolves the action within that bound, this fails explicitly
 * (`ELEMENT_NOT_FOUND`) rather than falling back to an unspecified alternate strategy.
 */
export async function executeStepAction(
  page: Page,
  originUrl: string,
  actionText: string,
): Promise<void> {
  const tools = createActionTools(page, originUrl);
  const agent = new Agent({
    id: "browser-execution",
    name: "Browser Execution",
    instructions: [
      "You operate a web browser to carry out one instruction at a time by calling the click,",
      "fill, submit, or wait tools. Resolve every target by its accessibility role and name from",
      "the provided snapshot below — never guess a role or name that isn't in the snapshot. Call",
      "as many tools as the instruction needs (for example, filling two fields then submitting),",
      "then stop.",
    ].join(" "),
    model: browserExecutionModel,
    tools,
  });

  const snapshot = await page.locator("body").ariaSnapshot();
  const prompt = [
    `Instruction: ${actionText}`,
    "Current page accessibility snapshot:",
    snapshot,
  ].join("\n\n");

  let result;
  try {
    result = await agent.generate(prompt, { maxSteps: MAX_TOOL_CALLS_PER_STEP });
  } catch (error) {
    throw new Error(
      `ELEMENT_NOT_FOUND: could not resolve action "${actionText}" — ${(error as Error).message}`,
    );
  }

  if (result.error || result.toolCalls.length === 0) {
    throw new Error(`ELEMENT_NOT_FOUND: no tool call resolved the action "${actionText}"`);
  }
}

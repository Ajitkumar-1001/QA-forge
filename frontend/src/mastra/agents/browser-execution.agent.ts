import { Agent } from "@mastra/core/agent";
import type { Page } from "playwright";
import { browserExecutionModel } from "../llm";
import { createActionTools } from "../tools/browser/actions.tool";
import { toPromptContext } from "../prompt-context";
import { redactValue } from "../tools/browser/evidence.tool";

const MAX_TOOL_CALLS_PER_STEP = 8;

export async function executeStepAction(
  page: Page,
  originUrl: string,
  actionText: string,

  credentialValue?: string,
): Promise<void> {
  const tools = createActionTools(page, originUrl, credentialValue);
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

  const rawSnapshot = await page.locator("body").ariaSnapshot();

  const snapshot = redactValue(rawSnapshot, credentialValue);

  const prompt = [
    `Instruction: ${actionText}`,
    "Current page accessibility snapshot:",
    toPromptContext({ provenance: "browser", content: snapshot }),
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

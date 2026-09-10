import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import type { Page } from "playwright";
import { browserExecutionModel } from "../llm";
import { createActionTools } from "../tools/browser/actions.tool";
import { toPromptContext } from "../prompt-context";
import { redactValue } from "../tools/browser/evidence.tool";

const MAX_TOOL_CALLS_PER_STEP = 8;

// The live Page and per-run credential aren't known until an investigation is running,
// so tools are resolved per-call from requestContext (Mastra's DynamicArgument) instead
// of being fixed at construction time — this is what lets browserExecutionAgent be a
// single static, registerable Agent instead of a fresh `new Agent(...)` per call.
interface BrowserExecutionRequestContext {
  page: Page;
  originUrl: string;
  credentialValue?: string;
}

export const browserExecutionAgent = new Agent({
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
  requestContextSchema: z.custom<BrowserExecutionRequestContext>(),
  tools: ({ requestContext }) =>
    createActionTools(
      requestContext.get("page"),
      requestContext.get("originUrl"),
      requestContext.get("credentialValue"),
    ),
});

export async function executeStepAction(
  page: Page,
  originUrl: string,
  actionText: string,

  credentialValue?: string,
): Promise<void> {
  const requestContext = new RequestContext<BrowserExecutionRequestContext>([
    ["page", page],
    ["originUrl", originUrl],
    ["credentialValue", credentialValue],
  ]);

  const rawSnapshot = await page.locator("body").ariaSnapshot();

  const snapshot = redactValue(rawSnapshot, credentialValue);

  const prompt = [
    `Instruction: ${actionText}`,
    "Current page accessibility snapshot:",
    toPromptContext({ provenance: "browser", content: snapshot }),
  ].join("\n\n");

  let result;
  try {
    result = await browserExecutionAgent.generate(prompt, {
      maxSteps: MAX_TOOL_CALLS_PER_STEP,
      requestContext,
    });
  } catch (error) {
    throw new Error(
      `ELEMENT_NOT_FOUND: could not resolve action "${actionText}" — ${(error as Error).message}`,
    );
  }

  if (result.error || result.toolCalls.length === 0) {
    throw new Error(`ELEMENT_NOT_FOUND: no tool call resolved the action "${actionText}"`);
  }
}

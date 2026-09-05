import { Agent } from "@mastra/core/agent";
import type { Page } from "playwright";
import { browserExecutionModel } from "../llm";
import { createActionTools } from "../tools/browser/actions.tool";
import { toPromptContext } from "../prompt-context";
import { redactValue } from "../tools/browser/evidence.tool";

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
  // T065, 2026-09-04 /speckit-converge (FR-001): previously the supplied credential was threaded
  // only into evidence redaction, never into the browser-execution path — a login-style objective
  // had no mechanism to actually use it, since the fill tool's value was entirely LLM-supplied.
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
  // T069, 2026-09-04 /speckit-converge (FR-006): the only capture-to-prompt path in the codebase
  // with no redaction pass — a field an earlier step already filled (or an error message echoing
  // input) could otherwise put the credential value directly into this prompt.
  const snapshot = redactValue(rawSnapshot, credentialValue);
  // T051, 2026-09-04 /speckit-converge (CRITICAL): this snapshot is captured application content
  // (Constitution II) — it must go through the same untrusted-data wrapper every other prompt in
  // this codebase uses, not a raw string interpolation. This is the one agent wired with
  // state-changing tools (click/fill/submit), so an unwrapped, unlabeled snapshot was the widest
  // prompt-injection surface in the feature.
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

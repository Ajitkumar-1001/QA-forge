import { anthropic } from "@ai-sdk/anthropic";
import type { Agent } from "@mastra/core/agent";
import type { z } from "zod";

/**
 * Pinned per agent role (research.md §5, NFR-003) — not one shared model across every call.
 * Dateless model IDs from the 4.6+ generation ARE the pinned snapshot, not a floating alias
 * (verified against @ai-sdk/anthropic's own AnthropicModelId type, 2026-09-04).
 */
export const rootCauseModel = anthropic("claude-opus-5");
export const validatorModel = anthropic("claude-opus-5");
export const plannerModel = anthropic("claude-sonnet-5");
/**
 * Not named in research.md §5 (written before the Browser Execution Agent existed — added later
 * by `/plan-eng-review`, 2026-09-04). Pinned here to the planner's tier, not root-cause/validator's:
 * per-step tool selection from an ariaSnapshot is a fast, low-latency task, not the deep,
 * competing-hypothesis reasoning `claude-opus-5` is reserved for. Filling this gap explicitly
 * rather than silently reusing `plannerModel` under a misleading name (T016, 2026-09-04).
 */
export const browserExecutionModel = anthropic("claude-sonnet-5");

/**
 * Thrown when structured output still fails validation after the repair attempt.
 * The CLI's top-level handler (T018) maps this to exit code 3 / LLM_PROVIDER_ERROR
 * (contracts/cli-contract.md, spec.md Edge Cases, resolved 2026-09-04 /speckit-clarify).
 */
export class StructuredOutputFailedError extends Error {
  /** Read by the CLI's top-level catch handler (run.ts) to pick the exit-3 reason code. */
  readonly reason = "LLM_PROVIDER_ERROR" as const;

  constructor(
    message: string,
    readonly cause_?: unknown,
  ) {
    super(message);
    this.name = "StructuredOutputFailedError";
  }
}

/**
 * Calls `agent.generate()` for structured output and defensively re-validates the result.
 *
 * Verified against @mastra/core@1.64.0's compiled source (research.md §5, T010, 2026-09-04):
 * `Agent.generate()` does NOT retry a schema-validation failure by default, and a resolved
 * promise does not by itself mean the object is valid — `FullOutput.error` can be set on an
 * otherwise-resolved call, and `.object` is not guaranteed to satisfy our own schema. This
 * function makes both checks explicit and retries once with the specific failure appended,
 * capping at 2 total attempts, before failing closed.
 */
export async function generateValidated<T>(
  agent: Agent,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastFailure: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = lastFailure
      ? `${prompt}\n\nYour previous response did not match the required schema: ${lastFailure}\nRespond again, correcting this.`
      : prompt;

    const result = await agent.generate(message, { structuredOutput: { schema } });

    if (result.error) {
      lastFailure = result.error.message;
      continue;
    }

    const parsed = schema.safeParse(result.object);
    if (parsed.success) {
      return parsed.data;
    }
    lastFailure = parsed.error.message;
  }

  throw new StructuredOutputFailedError(
    `Structured output failed schema validation after 2 attempts: ${lastFailure}`,
  );
}

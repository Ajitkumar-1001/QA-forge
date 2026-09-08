import { anthropic } from "@ai-sdk/anthropic";
import type { Agent } from "@mastra/core/agent";
import type { z } from "zod";

export const rootCauseModel = anthropic("claude-opus-5");
export const validatorModel = anthropic("claude-opus-5");
export const plannerModel = anthropic("claude-sonnet-5");

export const browserExecutionModel = anthropic("claude-sonnet-5");

export class StructuredOutputFailedError extends Error {

  readonly reason = "LLM_PROVIDER_ERROR" as const;

  constructor(
    message: string,
    readonly cause_?: unknown,
  ) {
    super(message);
    this.name = "StructuredOutputFailedError";
  }
}

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

    let result;
    try {
      result = await agent.generate(message, { structuredOutput: { schema } });
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      continue;
    }

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

  throw new StructuredOutputFailedError(`LLM call failed after 2 attempts: ${lastFailure}`);
}

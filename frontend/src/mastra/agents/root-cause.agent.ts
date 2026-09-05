import { Agent } from "@mastra/core/agent";
import { generateValidated, rootCauseModel } from "../llm";
import { rootCauseOutputSchema, type HypothesisCandidate } from "../schemas/hypothesis.schema";
import { toPromptContext, type ToolResult } from "../prompt-context";

export const rootCauseAgent = new Agent({
  id: "root-cause",
  name: "Root Cause",
  instructions: [
    "You investigate why a QA scenario step failed. Given the failure evidence and any relevant",
    "repository source, propose at least two competing, mutually distinct root-cause hypotheses.",
    "For each, cite specific evidence that supports it and specific evidence that contradicts it,",
    "and give an honest confidence from 0.0 to 1.0. Never propose only one hypothesis, and never",
    "inflate confidence to make a single explanation look more certain than the evidence supports.",
    "Each piece of evidence below is labeled with its own EVIDENCE_ID line — set evidenceRef to",
    "that exact string for whichever evidence you're citing, never a description or a made-up id.",
  ].join(" "),
  model: rootCauseModel,
});

/**
 * FR-009: on failure, generate at least two competing root-cause hypotheses, each with
 * supporting/contradicting evidence and a confidence value.
 */
export async function generateHypotheses(
  objective: string,
  evidence: ToolResult[],
): Promise<HypothesisCandidate[]> {
  const prompt = [
    `Objective: ${objective}`,
    "Evidence collected from this failed step:",
    ...evidence.map(toPromptContext),
  ].join("\n\n");
  const output = await generateValidated(rootCauseAgent, prompt, rootCauseOutputSchema);
  return output.hypotheses;
}

import { z } from "zod";
import { createStep } from "@mastra/core/workflows";
import { createInvestigateTool, type CandidateFile } from "../tools/repository/investigate.tool";
import { generateHypotheses } from "../agents/root-cause.agent";
import { evaluateHypothesis, proposeChecks } from "../agents/validator.agent";
import type { HypothesisCandidate } from "../schemas/hypothesis.schema";
import type { Evidence } from "../types";
import { type ToolResult } from "../prompt-context";
import { logEvent } from "../observability";

export type Verdict = "SUPPORTED" | "REJECTED" | "VALIDATING";

export interface InvestigationRoundState {

  triedHypotheses: unknown[];

  searchHistory: string[];
}

export interface InvestigationRoundResult extends InvestigationRoundState {
  verdict: Verdict;
}

export interface InvestigationRoundDeps {
  investigateRepo: (
    searchHistory: string[],
  ) => Promise<{ candidateFiles: unknown[]; searchHistory: string[] }>;
  createHypotheses: (candidateFiles: unknown[], triedHypotheses: unknown[]) => Promise<unknown[]>;
  validateCause: (hypotheses: unknown[]) => Promise<{ verdict: Verdict; hypotheses: unknown[] }>;
}

export async function runInvestigationRound(
  deps: InvestigationRoundDeps,
  state: InvestigationRoundState,
): Promise<InvestigationRoundResult> {
  const { candidateFiles, searchHistory } = await deps.investigateRepo(state.searchHistory);
  const hypotheses = await deps.createHypotheses(candidateFiles, state.triedHypotheses);
  const { verdict, hypotheses: validatedHypotheses } = await deps.validateCause(hypotheses);

  return {
    verdict,
    triedHypotheses: [...state.triedHypotheses, ...validatedHypotheses],
    searchHistory,
  };
}

export interface InvestigationRoundContext {
  objective: string;
  repoUrl: string;
  githubToken?: string;

  evidence: Evidence[];

  runId: string;
}

function evidenceToToolResults(evidence: Evidence[]): ToolResult[] {
  return evidence.map((item) => ({
    provenance: item.type === "CODE" ? ("code" as const) : ("browser" as const),
    content: item.content,

    id: item.id,
  }));
}

export function createInvestigationRoundDeps(
  context: InvestigationRoundContext,
): InvestigationRoundDeps {
  const investigateTool = createInvestigateTool(context.githubToken);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const baseEvidence = evidenceToToolResults(context.evidence);

  let iteration = 0;

  return {
    investigateRepo: async (searchHistory) => {
      const result = (await investigateTool.execute!(
        { repoUrl: context.repoUrl, searchText: context.objective, searchHistory },
        {} as never,
      )) as { candidateFiles: CandidateFile[]; searchHistory: string[] };
      return { candidateFiles: result.candidateFiles, searchHistory: result.searchHistory };
    },

    createHypotheses: async (candidateFilesInput) => {
      const candidateFiles = candidateFilesInput as CandidateFile[];
      const codeEvidence: ToolResult[] = candidateFiles.map((file) => ({
        provenance: "code",
        content: `${file.path}:\n${file.excerpt}`,

        id: file.path,
      }));
      return generateHypotheses(context.objective, [...baseEvidence, ...codeEvidence]);
    },

    validateCause: async (hypothesesInput) => {
      const candidates = hypothesesInput as HypothesisCandidate[];
      const validated = await Promise.all(
        candidates.map(async (candidate) => {
          const checks = await proposeChecks(candidate, baseEvidence);
          return evaluateHypothesis(candidate, checks, evidenceById);
        }),
      );
      const verdict: Verdict = validated.some((h) => h.status === "SUPPORTED")
        ? "SUPPORTED"
        : validated.some((h) => h.status === "VALIDATING")
          ? "VALIDATING"
          : "REJECTED";
      iteration += 1;
      logEvent({ type: "loop_iteration", runId: context.runId, iteration });
      return { verdict, hypotheses: validated };
    },
  };
}

export const investigationRoundStateSchema = z.object({
  triedHypotheses: z.array(z.unknown()),
  searchHistory: z.array(z.string()),
});

export const investigationRoundOutputSchema = investigationRoundStateSchema.extend({
  verdict: z.enum(["SUPPORTED", "REJECTED", "VALIDATING"]),
});

export function createInvestigationRoundStep(context: InvestigationRoundContext) {
  const deps = createInvestigationRoundDeps(context);
  return createStep({
    id: "investigation-round",
    inputSchema: investigationRoundStateSchema,
    outputSchema: investigationRoundOutputSchema,
    execute: async ({ inputData }) => runInvestigationRound(deps, inputData),
  });
}

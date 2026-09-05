import { z } from "zod";
import { createStep } from "@mastra/core/workflows";
import { createInvestigateTool, type CandidateFile } from "../tools/repository/investigate.tool";
import { generateHypotheses } from "../agents/root-cause.agent";
import { evaluateHypothesis, proposeChecks } from "../agents/validator.agent";
import type { HypothesisCandidate } from "../schemas/hypothesis.schema";
import type { Evidence } from "../types";
import { type ToolResult } from "../prompt-context";
import { logEvent } from "../observability";

/**
 * The composite step's pure sequencing logic — `investigateRepo → createHypotheses →
 * validateCause`, with `triedHypotheses`/`searchHistory` threaded forward — is exercised directly
 * by T028's unit test against dependency-injected fakes (research.md §1's testing strategy:
 * "export each workflow step's execute body as a plain function taking its dependencies as
 * parameters"). Below the pure logic, `createInvestigationRoundStep` wires it to the real
 * repository investigator, root-cause agent, and validator agent, and wraps it as a Mastra
 * `createStep()` for `dountil` to loop (research.md §2).
 */

export type Verdict = "SUPPORTED" | "REJECTED" | "VALIDATING";

export interface InvestigationRoundState {
  /** Every hypothesis evaluated across all rounds so far (Report.hypotheses, SC-006). */
  triedHypotheses: unknown[];
  /** What's already been searched, so a later round narrows rather than repeats (research.md §2). */
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

/**
 * One full round: repository investigation (consuming prior search history to avoid repeating a
 * search) → hypothesis generation → validation. Returns the accumulated state for the next round
 * — or for the post-loop `.branch()` — to consume.
 */
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
  /** The step-failure evidence (already redacted), cited by every round's hypothesis/validator
   * prompts — not just the repository content each round newly discovers. */
  evidence: Evidence[];
  /** NFR-005's informal log (T061, 2026-09-04 /speckit-converge). */
  runId: string;
}

function evidenceToToolResults(evidence: Evidence[]): ToolResult[] {
  return evidence.map((item) => ({
    provenance: item.type === "CODE" ? ("code" as const) : ("browser" as const),
    content: item.content,
    // T050, 2026-09-04 /speckit-converge: without this, no prompt ever showed the model a real
    // evidence id, so every structured check's evidenceId was uncitable and evaluateHypothesis
    // rejected it by construction — see prompt-context.ts's ToolResult.id doc for the full story.
    id: item.id,
  }));
}

/** Wires `InvestigationRoundDeps` to the real repository investigator, root-cause agent, and
 * validator agent (T032, T036, T037). */
export function createInvestigationRoundDeps(
  context: InvestigationRoundContext,
): InvestigationRoundDeps {
  const investigateTool = createInvestigateTool(context.githubToken);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const baseEvidence = evidenceToToolResults(context.evidence);
  // T061, 2026-09-04 /speckit-converge: closure-local counter — `dountil` doesn't hand this step's
  // execute an iteration number, and this is the composite step that runs once per round.
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
        // Repository files have no Evidence.id (they never pass through evidence.tool.ts) — the
        // file's own path is the natural, stable identifier a hypothesis's evidenceLinks can cite.
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

/** The Mastra step `dountil` loops (research.md §2) — ONE step whose `execute` body runs the
 * three-call sequence above, not a nested multi-step sub-workflow. */
export function createInvestigationRoundStep(context: InvestigationRoundContext) {
  const deps = createInvestigationRoundDeps(context);
  return createStep({
    id: "investigation-round",
    inputSchema: investigationRoundStateSchema,
    outputSchema: investigationRoundOutputSchema,
    execute: async ({ inputData }) => runInvestigationRound(deps, inputData),
  });
}

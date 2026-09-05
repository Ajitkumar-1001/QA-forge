/**
 * PARTIAL FILE (built incrementally, TDD-first): this covers the composite step's pure
 * sequencing logic — `investigateRepo → createHypotheses → validateCause`, with
 * `triedHypotheses`/`searchHistory` threaded forward — that T028's unit test exercises against
 * dependency-injected fakes (research.md §1's testing strategy: "export each workflow step's
 * execute body as a plain function taking its dependencies as parameters"). T038 wires this to
 * the real repository investigator, root-cause agent, and validator agent, and wraps it as a
 * Mastra `createStep()` for `dountil` to loop (research.md §2).
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

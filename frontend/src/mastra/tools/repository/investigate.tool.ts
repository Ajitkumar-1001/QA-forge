/**
 * PARTIAL FILE (built incrementally, TDD-first): this covers the pure relevance-floor logic
 * T027's unit test exercises. T032 adds the live clone+grep wrapper (`GIT_ASKPASS`-authenticated
 * shallow clone into `fs.mkdtempSync()`, self-delete in `finally`, the `createTool()` export)
 * around what's already here.
 */

export interface CandidateFile {
  path: string;
  /** 0.0–1.0, the relevance score against the observed failure (PRD §9.5). */
  relevance: number;
  excerpt: string;
}

/** PRD §9.5's minimum relevance bar — empty result over a weak guess (Constitution Principle I). */
export const RELEVANCE_FLOOR = 0.4;

/**
 * Omits any candidate that doesn't clear the relevance floor, rather than including a weak guess
 * (FR-007). A run with zero qualifying candidates returns an empty array — the caller must still
 * be able to produce hypotheses from runtime evidence alone.
 */
export function filterByRelevanceFloor(candidates: CandidateFile[]): CandidateFile[] {
  return candidates.filter((candidate) => candidate.relevance >= RELEVANCE_FLOOR);
}

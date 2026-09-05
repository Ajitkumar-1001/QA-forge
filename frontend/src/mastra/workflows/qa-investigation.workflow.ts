import type { Verdict } from "./investigation-round.step";

/**
 * PARTIAL FILE (built incrementally, TDD-first): this covers the post-loop `.branch()`'s two
 * verdict predicates, pinned as literal negations per `expert-system-design`'s second-pass
 * finding (research.md §2, 2026-09-04) — NOT re-derived from the `dountil` exit condition's
 * `iterationCount >= N`, and NOT an enumeration of the non-SUPPORTED verdict values. Either of
 * those alternatives reintroduces the double-fire/no-fire bug this exact loop has already been
 * fixed for twice: `iterationCount >= N` can be true the same round `verdict` becomes
 * `'SUPPORTED'` (both branches fire); an enumeration silently under-fires if the verdict type
 * ever gains a value neither branch names. A true negation is exhaustive and mutually exclusive
 * by construction, regardless of how the loop's exit was reached.
 *
 * T039 adds the actual `createWorkflow().dountil(...).branch([...]).commit()` wiring around
 * these two predicates, plus the `test-planner`/`browser-execution` step composition (PRD §9.1).
 */

export function isSupportedVerdict(inputData: { verdict: Verdict }): boolean {
  return inputData.verdict === "SUPPORTED";
}

export function isBudgetExhaustedVerdict(inputData: { verdict: Verdict }): boolean {
  return !isSupportedVerdict(inputData);
}

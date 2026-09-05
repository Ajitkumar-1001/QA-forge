import { describe, expect, it, vi } from "vitest";
import { runInvestigationRound } from "@/mastra/workflows/investigation-round.step";

describe("runInvestigationRound — composite step sequencing (research.md §2)", () => {
  it("calls investigateRepo, createHypotheses, and validateCause in sequence", async () => {
    const calls: string[] = [];
    const deps = {
      investigateRepo: vi.fn(async () => {
        calls.push("investigateRepo");
        return { candidateFiles: ["file.ts"], searchHistory: ["query-1"] };
      }),
      createHypotheses: vi.fn(async () => {
        calls.push("createHypotheses");
        return ["hypothesis-1"];
      }),
      validateCause: vi.fn(async () => {
        calls.push("validateCause");
        return { verdict: "REJECTED" as const, hypotheses: ["hypothesis-1-rejected"] };
      }),
    };

    await runInvestigationRound(deps, { triedHypotheses: [], searchHistory: [] });

    expect(calls).toEqual(["investigateRepo", "createHypotheses", "validateCause"]);
  });

  it("threads searchHistory forward so a later round can narrow its search", async () => {
    const deps = {
      investigateRepo: vi.fn(async (searchHistory: string[]) => {
        // The round must pass in what was already searched.
        expect(searchHistory).toEqual(["round-1-query"]);
        return { candidateFiles: [], searchHistory: [...searchHistory, "round-2-query"] };
      }),
      createHypotheses: vi.fn(async () => []),
      validateCause: vi.fn(async () => ({ verdict: "VALIDATING" as const, hypotheses: [] })),
    };

    const result = await runInvestigationRound(deps, {
      triedHypotheses: [],
      searchHistory: ["round-1-query"],
    });

    expect(result.searchHistory).toEqual(["round-1-query", "round-2-query"]);
  });

  it("accumulates triedHypotheses across rounds rather than discarding earlier ones", async () => {
    const deps = {
      investigateRepo: vi.fn(async () => ({ candidateFiles: [], searchHistory: [] })),
      createHypotheses: vi.fn(async (_files: unknown[], triedHypotheses: unknown[]) => {
        // The round must pass in what was already tried, so it isn't proposed again.
        expect(triedHypotheses).toEqual(["already-rejected"]);
        return ["new-hypothesis"];
      }),
      validateCause: vi.fn(async () => ({
        verdict: "REJECTED" as const,
        hypotheses: ["new-hypothesis-rejected"],
      })),
    };

    const result = await runInvestigationRound(deps, {
      triedHypotheses: ["already-rejected"],
      searchHistory: [],
    });

    expect(result.triedHypotheses).toEqual(["already-rejected", "new-hypothesis-rejected"]);
  });

  it("surfaces the SUPPORTED verdict without altering the sequencing contract", async () => {
    const deps = {
      investigateRepo: vi.fn(async () => ({ candidateFiles: [], searchHistory: [] })),
      createHypotheses: vi.fn(async () => ["h1"]),
      validateCause: vi.fn(async () => ({ verdict: "SUPPORTED" as const, hypotheses: ["h1-supported"] })),
    };

    const result = await runInvestigationRound(deps, { triedHypotheses: [], searchHistory: [] });

    expect(result.verdict).toBe("SUPPORTED");
  });
});

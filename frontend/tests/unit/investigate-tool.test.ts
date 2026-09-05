import { describe, expect, it } from "vitest";
import {
  filterByRelevanceFloor,
  RELEVANCE_FLOOR,
  type CandidateFile,
} from "@/mastra/tools/repository/investigate.tool";

describe("filterByRelevanceFloor — the 0.4 relevance bar (FR-007, Constitution Principle I)", () => {
  it("excludes candidates below the floor", () => {
    const candidates: CandidateFile[] = [
      { path: "a.ts", relevance: 0.1, excerpt: "" },
      { path: "b.ts", relevance: 0.39, excerpt: "" },
    ];
    expect(filterByRelevanceFloor(candidates)).toHaveLength(0);
  });

  it("includes candidates at or above the floor", () => {
    const candidates: CandidateFile[] = [
      { path: "a.ts", relevance: RELEVANCE_FLOOR, excerpt: "" },
      { path: "b.ts", relevance: 0.9, excerpt: "" },
    ];
    expect(filterByRelevanceFloor(candidates).map((c) => c.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns an empty array — not a weak guess — when nothing clears the floor", () => {
    const candidates: CandidateFile[] = [{ path: "unrelated.ts", relevance: 0.05, excerpt: "" }];
    expect(filterByRelevanceFloor(candidates)).toEqual([]);
  });

  it("handles a zero-candidate input the same way (empty in, empty out)", () => {
    expect(filterByRelevanceFloor([])).toEqual([]);
  });

  it("preserves the original candidate order among qualifying files", () => {
    const candidates: CandidateFile[] = [
      { path: "z.ts", relevance: 0.5, excerpt: "" },
      { path: "a.ts", relevance: 0.6, excerpt: "" },
    ];
    expect(filterByRelevanceFloor(candidates).map((c) => c.path)).toEqual(["z.ts", "a.ts"]);
  });
});

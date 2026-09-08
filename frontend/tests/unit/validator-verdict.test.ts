import { describe, expect, it } from "vitest";
import type { Verdict } from "@/mastra/workflows/investigation-round.step";
import {
  isBudgetExhaustedVerdict,
  isSupportedVerdict,
} from "@/mastra/workflows/qa-investigation.workflow";

const ALL_VERDICTS: Verdict[] = ["SUPPORTED", "REJECTED", "VALIDATING"];

describe("qa-investigation post-loop branch predicates (Constitution I, research.md §2)", () => {
  it("isSupportedVerdict is true only for SUPPORTED", () => {
    expect(isSupportedVerdict({ verdict: "SUPPORTED" })).toBe(true);
    expect(isSupportedVerdict({ verdict: "REJECTED" })).toBe(false);
    expect(isSupportedVerdict({ verdict: "VALIDATING" })).toBe(false);
  });

  it("REJECTED/VALIDATING do not end the loop — no REJECTED terminal branch exists to test", () => {

    expect(isSupportedVerdict({ verdict: "REJECTED" })).toBe(false);
    expect(isSupportedVerdict({ verdict: "VALIDATING" })).toBe(false);
  });

  it("the two predicates are true logical complements for every value of the verdict type", () => {
    for (const verdict of ALL_VERDICTS) {
      const supported = isSupportedVerdict({ verdict });
      const exhausted = isBudgetExhaustedVerdict({ verdict });

      expect(supported).toBe(!exhausted);
      expect(supported || exhausted).toBe(true);
      expect(supported && exhausted).toBe(false);
    }
  });
});

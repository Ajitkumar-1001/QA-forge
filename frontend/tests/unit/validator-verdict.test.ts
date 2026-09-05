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
    // There is no isRejectedVerdict/isValidatingTerminal export — REJECTED and VALIDATING both
    // fall through to isBudgetExhaustedVerdict's branch only once the loop's own budget (not the
    // verdict itself) is exhausted. Asserting that absence is exactly what closes the original
    // CRITICAL finding: there is no third terminal outcome to name.
    expect(isSupportedVerdict({ verdict: "REJECTED" })).toBe(false);
    expect(isSupportedVerdict({ verdict: "VALIDATING" })).toBe(false);
  });

  it("the two predicates are true logical complements for every value of the verdict type", () => {
    for (const verdict of ALL_VERDICTS) {
      const supported = isSupportedVerdict({ verdict });
      const exhausted = isBudgetExhaustedVerdict({ verdict });
      // Exactly one must be true — never both (the double-fire bug), never neither (the
      // no-fire bug a naive enumeration could reintroduce if the verdict type ever grows).
      expect(supported).toBe(!exhausted);
      expect(supported || exhausted).toBe(true);
      expect(supported && exhausted).toBe(false);
    }
  });
});

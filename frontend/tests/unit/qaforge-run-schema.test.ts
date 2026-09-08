import { describe, expect, it } from "vitest";
import { runSchema, runStatusSchema, runs } from "@/data/qaforge";

describe("runSchema — fixture runs match the real backend's RunStatus/ErrorReason/ReportResult", () => {
  it("parses every fixture run", () => {
    for (const run of runs) {
      expect(() => runSchema.parse(run)).not.toThrow();
    }
  });

  it("rejects the removed CANCELLED status", () => {
    expect(runStatusSchema.safeParse("CANCELLED").success).toBe(false);
  });
});

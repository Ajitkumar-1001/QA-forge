import { describe, expect, it } from "vitest";
import { runSchema, runStatusSchema, runs } from "@/data/qaforge";

/** Task 1 (plan-qaforge-run-schema) — RunStatus/ErrorReason/ReportResult narrowed to match
 * src/mastra/types.ts exactly. Every fixture Run must parse against the new schema, and the
 * dropped CANCELLED status must no longer be a valid RunStatus. */
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

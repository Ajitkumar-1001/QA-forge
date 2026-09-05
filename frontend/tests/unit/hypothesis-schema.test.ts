import { describe, expect, it } from "vitest";
import { hypothesisCandidateSchema } from "@/mastra/schemas/hypothesis.schema";

/** T058, 2026-09-04 /speckit-converge (FR-009) — previously unenforced: a schema-valid hypothesis
 * with zero evidence links could flow straight into the report. */
describe("hypothesisCandidateSchema — evidenceLinks non-empty (T058, FR-009)", () => {
  it("rejects a hypothesis with an empty evidenceLinks array", () => {
    const result = hypothesisCandidateSchema.safeParse({
      description: "Something is wrong",
      confidence: 0.8,
      evidenceLinks: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a hypothesis with at least one evidence link", () => {
    const result = hypothesisCandidateSchema.safeParse({
      description: "Something is wrong",
      confidence: 0.8,
      evidenceLinks: [{ evidenceRef: "evidence-1", role: "SUPPORTING" }],
    });
    expect(result.success).toBe(true);
  });
});

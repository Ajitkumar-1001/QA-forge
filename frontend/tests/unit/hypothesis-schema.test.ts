import { describe, expect, it } from "vitest";
import { hypothesisCandidateSchema } from "@/mastra/schemas/hypothesis.schema";

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

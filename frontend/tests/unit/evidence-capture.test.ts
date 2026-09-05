import { describe, expect, it } from "vitest";
import { assembleEvidence } from "@/mastra/tools/browser/evidence.tool";

describe("assembleEvidence — console/network/DOM → Evidence (FR-005)", () => {
  it("produces a CONSOLE evidence entry from captured console messages", () => {
    const evidence = assembleEvidence({
      stepId: "step-1",
      console: [
        { type: "error", text: "Uncaught TypeError: x is not a function" },
        { type: "warning", text: "deprecated API" },
      ],
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ stepId: "step-1", type: "CONSOLE" });
    expect(evidence[0]?.content).toContain("Uncaught TypeError");
    expect(evidence[0]?.content).toContain("deprecated API");
  });

  it("produces one NETWORK evidence entry per captured request, with status in metadata", () => {
    const evidence = assembleEvidence({
      stepId: "step-2",
      network: [
        {
          url: "https://example.com/api/login",
          status: 401,
          requestHeaders: { Authorization: "Bearer abc" },
          responseHeaders: { "Content-Type": "application/json" },
          responseBody: { error: "invalid credentials" },
        },
      ],
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ stepId: "step-2", type: "NETWORK" });
    expect(evidence[0]?.metadata).toMatchObject({ status: 401 });
    // Header value redacted, name/presence preserved (FR-006) — assembly must not bypass redaction.
    expect((evidence[0]?.metadata.requestHeaders as Record<string, string>).Authorization).toBe(
      "[REDACTED]",
    );
  });

  it("produces a DOM evidence entry with stepId null only when explicitly not tied to a step", () => {
    const evidence = assembleEvidence({ stepId: null, domHtml: "<html><body>x</body></html>" });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ stepId: null, type: "DOM" });
  });

  it("produces no evidence entries for capture categories that weren't provided", () => {
    expect(assembleEvidence({ stepId: "step-3" })).toHaveLength(0);
  });

  it("assembles multiple categories together, each as its own Evidence entry", () => {
    const evidence = assembleEvidence({
      stepId: "step-4",
      console: [{ type: "error", text: "boom" }],
      network: [
        {
          url: "https://example.com/api",
          status: 500,
          requestHeaders: {},
          responseHeaders: {},
        },
      ],
      domHtml: "<html></html>",
    });
    expect(evidence.map((e) => e.type).sort()).toEqual(["CONSOLE", "DOM", "NETWORK"]);
  });
});

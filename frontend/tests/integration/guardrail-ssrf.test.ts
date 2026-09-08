import { describe, expect, it, vi } from "vitest";

vi.mock("@/mastra/agents/browser-execution.agent", () => ({
  executeStepAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/mastra/agents/root-cause.agent", () => ({
  generateHypotheses: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/mastra/agents/validator.agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/mastra/agents/validator.agent")>()),
}));
vi.mock("@/mastra/tools/repository/investigate.tool", () => ({
  createInvestigateTool: () => ({
    execute: vi.fn().mockResolvedValue({ candidateFiles: [], searchHistory: [] }),
  }),
}));

const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");

describe("SSRF deny-list guardrail (SEC-001, SC-004)", () => {
  it("refuses the cloud-metadata address as the initial URL, before any request reaches it", async () => {
    await expect(
      runQaInvestigation({
        objective: "anything",
        applicationUrl: "http://169.254.169.254/",
        repoUrl: "https://example.com/owner/repo.git",
        steps: [
          {
            position: 0,
            action: "n/a",
            expectedOutcome: "n/a",
            successCriteria: { kind: "url", match: "" },
            failureCriteria: { kind: "url", match: "impossible" },
          },
        ],
        runId: "test-run-ssrf-metadata",
      }),
    ).rejects.toMatchObject({
      name: "SsrfDeniedError",
      reason: "APP_UNREACHABLE",
    });
  }, 15000);

  it("refuses a loopback address identically", async () => {
    await expect(
      runQaInvestigation({
        objective: "anything",
        applicationUrl: "http://127.0.0.1:1/",
        repoUrl: "https://example.com/owner/repo.git",
        steps: [],
        runId: "test-run-ssrf-loopback",
      }),
    ).rejects.toMatchObject({ name: "SsrfDeniedError" });
  }, 15000);
});

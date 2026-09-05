import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * FAIL sub-test (SUPPORTED verdict reached) — FR-009, FR-010, SC-006. Per plan.md's own file
 * description: "real Mastra workflow, mocked model, fake browser tool." The dountil/branch loop,
 * `investigation-round.step.ts`'s sequencing, and `validator.agent.ts`'s code-decides-the-verdict
 * logic are all REAL and unmocked — only the LLM-touching agent calls and the repository
 * investigator are replaced with fakes, so the test is fast, deterministic, and makes no calls to
 * Anthropic or a real git remote.
 *
 * `executeStepAction` (the Browser Execution Agent) is mocked to a no-op rather than faked at the
 * Playwright level — it internally constructs a real Mastra `Agent` and calling that would need
 * an Anthropic call. The step's own success/failure is instead driven by its criteria genuinely
 * not matching the page navigated to, which is real, unmocked page state.
 *
 * Navigation target is `https://example.com` (a real, stable, network-dependent request), not
 * `tests/integration/fixtures/http-server.ts`'s local server — SEC-001's SSRF deny-list is
 * absolute (no opt-out, confirmed 2026-09-04 `/speckit-clarify`) and correctly refuses any
 * loopback target, including the local fixture server, through this unmocked path. This test
 * therefore requires real network access; T020–T023's unit tests already cover the fixture
 * server's redirect-chain/credential-body scenarios against `navigate.tool.ts`'s pure functions
 * directly, where SSRF enforcement is exactly what's being tested rather than an obstacle to it.
 */

vi.mock("@/mastra/agents/browser-execution.agent", () => ({
  executeStepAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/mastra/agents/root-cause.agent", () => ({
  generateHypotheses: vi.fn().mockResolvedValue([
    { description: "Middleware checks the wrong cookie name.", confidence: 0.9, evidenceLinks: [] },
    { description: "The database connection is flaky.", confidence: 0.3, evidenceLinks: [] },
  ]),
}));

vi.mock("@/mastra/agents/validator.agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mastra/agents/validator.agent")>();
  return {
    ...actual,
    // Semantic checks (not structured) so this doesn't need to match a real Evidence.id — only
    // `evaluateHypothesis` (kept real, from `actual`) decides SUPPORTED/REJECTED from these.
    proposeChecks: vi.fn(async (candidate: { confidence: number; description: string }) => [
      {
        kind: "semantic" as const,
        evidenceId: "e1",
        assertion: candidate.description,
        passed: candidate.confidence > 0.5,
      },
    ]),
  };
});

vi.mock("@/mastra/tools/repository/investigate.tool", () => ({
  createInvestigateTool: () => ({
    execute: vi.fn().mockResolvedValue({
      candidateFiles: [{ path: "middleware.ts", relevance: 0.9, excerpt: "checks cookies.session" }],
      searchHistory: ["session"],
    }),
  }),
}));

const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");

describe("qa-investigation workflow — FAIL sub-test (SUPPORTED verdict reached)", () => {
  let report: Awaited<ReturnType<typeof runQaInvestigation>>;

  beforeAll(async () => {
    report = await runQaInvestigation({
      objective: "Verify the dashboard loads",
      applicationUrl: "https://example.com",
      repoUrl: "https://example.com/owner/repo.git",
      steps: [
        {
          position: 0,
          action: "Check for a heading that does not exist on this page",
          expectedOutcome: "n/a — deliberately unmet, to drive the FAIL/investigation path",
          successCriteria: { kind: "selectorPresent", selector: "text=Definitely Not On This Page" },
          failureCriteria: { kind: "selectorAbsent", selector: "text=Definitely Not On This Page" },
        },
      ],
      maxIterations: 3,
    });
  }, 30000);

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("produces a FAIL report whose winningHypothesisId matches the SUPPORTED hypothesis (FR-009, FR-010)", () => {
    expect(report.result).toBe("FAIL");
    const winning = report.hypotheses.find((h) => h.id === report.winningHypothesisId);
    expect(winning?.description).toBe("Middleware checks the wrong cookie name.");
    expect(winning?.status).toBe("SUPPORTED");
  });

  it("includes every hypothesis evaluated this run in Report.hypotheses, not just the winner (SC-006)", () => {
    expect(report.hypotheses).toHaveLength(2);
    expect(report.hypotheses.map((h) => h.status).sort()).toEqual(["REJECTED", "SUPPORTED"]);
  });

  it("cites the SUPPORTED hypothesis's supporting evidence in the report (FR-009)", () => {
    expect(report.evidence.length).toBeGreaterThan(0);
    expect(report.steps[0]?.status).toBe("FAILED");
  });
});

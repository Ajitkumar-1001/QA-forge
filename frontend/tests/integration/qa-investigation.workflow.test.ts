import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Three sub-tests of the same real Mastra workflow, differing only in what the mocked
 * agents/tools return — FR-004, FR-009–FR-011, SC-002, SC-006, D4. Per plan.md's own file
 * description: "real Mastra workflow, mocked model, fake browser tool." The `dountil`/`.branch()`
 * loop, `investigation-round.step.ts`'s sequencing, and `validator.agent.ts`'s
 * code-decides-the-verdict logic are all REAL and unmocked in every sub-test — only the
 * LLM-touching agent calls and the repository investigator are replaced with fakes, so no test
 * here costs an Anthropic call or needs a real git remote.
 *
 * `executeStepAction` (the Browser Execution Agent) is mocked to a no-op rather than faked at the
 * Playwright level — it internally constructs a real Mastra `Agent`, and calling that would need
 * an Anthropic call. Each step's own success/failure is instead driven by its criteria genuinely
 * matching (or not) the real page navigated to.
 *
 * Navigation target is `https://example.com` (a real, stable, network-dependent request), not
 * `tests/integration/fixtures/http-server.ts`'s local server — SEC-001's SSRF deny-list is
 * absolute (no opt-out, confirmed 2026-09-04 `/speckit-clarify`) and correctly refuses any
 * loopback target, including the local fixture server, through this unmocked path. These tests
 * therefore require real network access; T020–T023's unit tests already cover the fixture
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

// Vitest only allows referencing a variable inside a hoisted `vi.mock()` factory when its name
// starts with `mock` — needed here so later blocks can assert on call counts (T043/T044).
const mockInvestigateExecute = vi.fn().mockResolvedValue({
  candidateFiles: [{ path: "middleware.ts", relevance: 0.9, excerpt: "checks cookies.session" }],
  searchHistory: ["session"],
});

vi.mock("@/mastra/tools/repository/investigate.tool", () => ({
  createInvestigateTool: () => ({ execute: mockInvestigateExecute }),
}));

const { generateHypotheses } = await import("@/mastra/agents/root-cause.agent");
const { proposeChecks } = await import("@/mastra/agents/validator.agent");
const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");

const FAILING_STEP = {
  position: 0,
  action: "Check for a heading that does not exist on this page",
  expectedOutcome: "n/a — deliberately unmet, to drive the FAIL/investigation path",
  successCriteria: { kind: "selectorPresent" as const, selector: "text=Definitely Not On This Page" },
  failureCriteria: { kind: "selectorAbsent" as const, selector: "text=Definitely Not On This Page" },
};

afterAll(() => {
  vi.restoreAllMocks();
});

describe("qa-investigation workflow — FAIL sub-test (SUPPORTED verdict reached)", () => {
  let report: Awaited<ReturnType<typeof runQaInvestigation>>;

  beforeAll(async () => {
    report = await runQaInvestigation({
      objective: "Verify the dashboard loads",
      applicationUrl: "https://example.com",
      repoUrl: "https://example.com/owner/repo.git",
      steps: [FAILING_STEP],
      maxIterations: 3,
    });
  }, 30000);

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

describe("qa-investigation workflow — INCONCLUSIVE sub-test (loop budget exhausted, nothing SUPPORTED)", () => {
  let report: Awaited<ReturnType<typeof runQaInvestigation>>;

  beforeAll(async () => {
    // Every hypothesis, every round, fails its own check — the loop can never reach SUPPORTED and
    // must exhaust its budget (maxIterations: 2) into INCONCLUSIVE (FR-011, D4) rather than
    // falling back to the strongest rejected candidate (User Story 2's own guarantee).
    vi.mocked(generateHypotheses).mockResolvedValue([
      { description: "Hypothesis A — never confirmed.", confidence: 0.4, evidenceLinks: [] },
      { description: "Hypothesis B — also never confirmed.", confidence: 0.5, evidenceLinks: [] },
    ]);
    vi.mocked(proposeChecks).mockImplementation(async (candidate) => [
      {
        kind: "semantic" as const,
        evidenceId: "e1",
        assertion: candidate.description,
        passed: false,
      },
    ]);

    report = await runQaInvestigation({
      objective: "Verify the dashboard loads",
      applicationUrl: "https://example.com",
      repoUrl: "https://example.com/owner/repo.git",
      steps: [FAILING_STEP],
      maxIterations: 2,
    });
  }, 30000);

  it("produces an explicit INCONCLUSIVE result, never a fabricated cause (FR-011, D4)", () => {
    expect(report.result).toBe("INCONCLUSIVE");
    expect(report.winningHypothesisId).toBeNull();
    expect(report.confidence).toBeNull();
  });

  it("lists every hypothesis as ruled out, none SUPPORTED — never falls back to the strongest rejected candidate (SC-002)", () => {
    expect(report.hypotheses.length).toBeGreaterThan(0);
    expect(report.hypotheses.every((h) => h.status !== "SUPPORTED")).toBe(true);
  });
});

describe("qa-investigation workflow — PASS sub-test (every step succeeds → investigation never invoked)", () => {
  let report: Awaited<ReturnType<typeof runQaInvestigation>>;

  beforeAll(async () => {
    vi.mocked(generateHypotheses).mockClear();
    mockInvestigateExecute.mockClear();

    report = await runQaInvestigation({
      objective: "Verify the dashboard loads",
      applicationUrl: "https://example.com",
      repoUrl: "https://example.com/owner/repo.git",
      steps: [
        {
          position: 0,
          action: "Confirm the page loaded",
          expectedOutcome: "n/a — trivially true against the real page navigated to",
          successCriteria: { kind: "url", match: "example.com" },
          failureCriteria: { kind: "url", match: "this-will-never-match-anything" },
        },
      ],
      maxIterations: 3,
    });
  }, 30000);

  it("produces a PASS report with no hypotheses and no investigation evidence recorded (FR-004)", () => {
    expect(report.result).toBe("PASS");
    expect(report.hypotheses).toHaveLength(0);
    expect(report.evidence).toHaveLength(0);
    expect(report.winningHypothesisId).toBeNull();
    expect(report.confidence).toBeNull();
    expect(report.steps.every((step) => step.status === "PASSED")).toBe(true);
  });

  it("never invokes repository investigation or hypothesis generation (FR-004)", () => {
    expect(generateHypotheses).not.toHaveBeenCalled();
    expect(mockInvestigateExecute).not.toHaveBeenCalled();
  });
});

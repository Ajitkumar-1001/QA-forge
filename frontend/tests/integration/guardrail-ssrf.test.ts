import { describe, expect, it, vi } from "vitest";

/**
 * SSRF deny-list guardrail (SEC-001, SC-004), against `runQaInvestigation`'s real, unmocked
 * navigation path (Layers A+B+C all live) — only the LLM-touching agents are faked, same pattern
 * as `qa-investigation.workflow.test.ts`, since reaching this point at all needs a resolved test
 * plan and this test cares about what happens before any step even runs.
 *
 * **Initial-URL case**: tested end-to-end for real against `169.254.169.254` — the actual
 * well-known cloud-metadata address, not a stand-in — via the full `chromium.launch()` +
 * SSRF-proxy + navigate-tool path.
 *
 * **Redirect-introduced case**: NOT tested end-to-end here. Proving it live needs a publicly
 * reachable server that redirects to an internal address; this sandboxed environment's only
 * controllable server binds to loopback, which Layer A already denies as the *initial* URL before
 * a redirect could ever be attempted — so there's no way to construct "public URL that redirects
 * to internal" without a real external server this repo doesn't control. That specific case is
 * covered for real elsewhere instead: `tests/unit/ssrf.test.ts` proves `isUrlAllowed` — the exact
 * function `installNavigationGuard`'s CDP `Fetch.requestPaused` handler calls on *every* hop, not
 * just the first — denies a redirect-shaped target identically to an initial one, and research.md
 * §4 documents the empirical verification that CDP `Fetch` fires per-hop (unlike `page.route()`).
 */

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
      }),
    ).rejects.toMatchObject({ name: "SsrfDeniedError" });
  }, 15000);
});

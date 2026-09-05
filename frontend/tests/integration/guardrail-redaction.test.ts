import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createEvidenceRecorder, createEvidenceTool } from "@/mastra/tools/browser/evidence.tool";
import { startFixtureServer, type FixtureServer } from "./fixtures/http-server";

const CREDENTIAL = "supersecret123";

/**
 * Credential redaction guardrail (SEC-002, SC-003) — quickstart.md's own guardrail scenario is
 * `grep -c supersecret123` against the full `--format json` output returning `0`. Exercised here
 * against `evidence.tool.ts`'s REAL, unmocked capture pipeline (`createEvidenceRecorder` +
 * `createEvidenceTool`) receiving a REAL network response containing the credential — not just
 * the pure `redactBody`/`redactValue`/`redactHeaders` functions T023 already unit-tests directly.
 *
 * Navigates straight to `tests/integration/fixtures/http-server.ts`'s `/credential-body` endpoint
 * via a bare `page.goto()`, bypassing `createNavigateTool`/`runQaInvestigation` entirely — SEC-001's
 * SSRF deny-list correctly refuses this loopback server through that path (see
 * `guardrail-ssrf.test.ts`), so this test intentionally exercises the evidence/redaction layer in
 * isolation rather than routing a genuinely-denied URL through the full orchestration.
 */
describe("credential redaction guardrail (SEC-002, SC-003)", () => {
  let server: FixtureServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
    await server.close();
  });

  it("never lets the literal credential value survive into collected evidence", async () => {
    const page = await browser.newPage();
    const recorder = createEvidenceRecorder(page);
    const response = await page.goto(`${server.url}/credential-body`);
    // Give the recorder's async response.json() handler a tick to run (evidence.tool.ts attaches
    // it via .then(), not await, since Playwright's 'response' event handler can't block).
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response?.status()).toBe(200);

    const evidenceTool = createEvidenceTool(page, recorder, { credentialValue: CREDENTIAL });
    const { evidence } = (await evidenceTool.execute!({ stepId: "0" }, {} as never)) as {
      evidence: Array<{ content: string; metadata: unknown }>;
    };

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(CREDENTIAL);
    // The fixture's /credential-body response literally contains "supersecret123" as its
    // password field — confirm redaction actually did something, not that the value was simply
    // never captured in the first place (a vacuous pass).
    const networkEvidence = evidence.find((item) => (item as { type?: string }).type === "NETWORK");
    expect(networkEvidence?.content).toContain("REDACTED");
  }, 15000);
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createEvidenceRecorder, createEvidenceTool } from "@/mastra/tools/browser/evidence.tool";
import { startFixtureServer, type FixtureServer } from "./fixtures/http-server";

const CREDENTIAL = "supersecret123";

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

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response?.status()).toBe(200);

    const evidenceTool = createEvidenceTool(page, recorder, { credentialValue: CREDENTIAL });
    const { evidence } = (await evidenceTool.execute!({ stepId: "0" }, {} as never)) as {
      evidence: Array<{ content: string; metadata: unknown }>;
    };

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(CREDENTIAL);

    const networkEvidence = evidence.find((item) => (item as { type?: string }).type === "NETWORK");
    expect(networkEvidence?.content).toContain("REDACTED");
  }, 15000);
});

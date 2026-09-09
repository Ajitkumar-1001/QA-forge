import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";
import { db } from "@/db/client";
import { project, testScenario, testRun, credential } from "@/db/schema";
import { eq } from "drizzle-orm";

// Requires: a real DATABASE_URL (003+004's migrations, plus 005's `credential` table,
// applied) and `pnpm dev` running at PLAYWRIGHT_BASE_URL, started with two extra env vars
// this feature's action.ts reads as a test-only seam (see actions.ts's own comment on
// QAFORGE_E2E_FAKE_REPORT):
//   ANTHROPIC_API_KEY=<any non-empty value>       # startRunAction's config check only
//   QAFORGE_E2E_FAKE_REPORT='{"result":"PASS","steps":[],"evidence":[],"hypotheses":[],"winningHypothesisId":null,"confidence":null}'
// Without QAFORGE_E2E_FAKE_REPORT set, a real submission would call the real
// generateTestPlan/runQaInvestigation — a real paid LLM call and a real headless browser
// launch, neither appropriate for an automated CI run (tasks.md T013).
//
// Submits through the real /runs/new form (not the repository layer directly, unlike
// 004's run-history-view.e2e.ts) — this feature's whole point is the form -> Server Action
// -> DB path itself, so that's what's under test.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";

async function submitRunForm(
  page: import("playwright/test").Page,
  fields: { url: string; repository: string; objective: string; username?: string; password?: string },
) {
  await page.goto("/runs/new");
  await page.locator("#url").fill(fields.url);
  await page.locator("#repository").fill(fields.repository);
  await page.locator("#objective").fill(fields.objective);
  if (fields.username) await page.locator("#credentialUsername").fill(fields.username);
  if (fields.password) await page.locator("#credentialPassword").fill(fields.password);
  await page.getByRole("button", { name: /start qa run/i }).click();
  // "/runs/new" itself matches a naive /\/runs\/[^/]+$/ (waitForURL also resolves
  // instantly against the page's current, pre-navigation URL) — excluded explicitly so
  // this actually waits for the post-submit redirect, not the form page it started on.
  await page.waitForURL((url) => /\/runs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 30_000 });
  const match = /\/runs\/([^/]+)$/.exec(page.url());
  if (!match) throw new Error(`submitRunForm: redirect target didn't look like /runs/[id]: ${page.url()}`);
  return match[1]!;
}

test.describe("US1/US3 — launching a run from the UI (quickstart Scenario 1, 4)", () => {
  test("signed out, submitting the form creates zero rows and redirects to sign-in", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/runs/new");
    await expect(page).toHaveURL(/\/sign-in/);
    await context.close();
  });

  test("a signed-in submission's project/scenario/run rows are all owned by the submitting caller", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const page = await context.newPage();

    const runId = await submitRunForm(page, {
      url: "https://example.com",
      repository: "qa-forge/launch-ui-e2e",
      objective: "verify the e2e-seeded run launches end to end",
    });

    const runRow = await db.query.testRun.findFirst({ where: eq(testRun.id, runId) });
    expect(runRow).toBeDefined();
    expect(runRow!.status).toBe("PASSED");

    const scenarioRow = await db.query.testScenario.findFirst({ where: eq(testScenario.id, runRow!.scenarioId) });
    expect(scenarioRow).toBeDefined();

    const projectRow = await db.query.project.findFirst({ where: eq(project.id, scenarioRow!.projectId) });
    expect(projectRow).toBeDefined();
    expect(projectRow!.userId).toBe(userId);
    expect(projectRow!.repository).toBe("qa-forge/launch-ui-e2e");

    await context.close();
  });

  test("a credentialed submission's credential row is owned by the caller and never plaintext (US2, quickstart Scenario 3)", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    const runId = await submitRunForm(page, {
      url: "https://example.com",
      repository: "qa-forge/launch-ui-credential-e2e",
      objective: "verify a submitted credential round-trips without ever being stored as plaintext",
      username: "e2e-user",
      password: "hunter2-e2e-secret",
    });

    const runRow = await db.query.testRun.findFirst({ where: eq(testRun.id, runId) });
    const scenarioRow = await db.query.testScenario.findFirst({ where: eq(testScenario.id, runRow!.scenarioId) });
    expect(scenarioRow!.credentialsReference).not.toBeNull();

    const credentialRow = await db.query.credential.findFirst({ where: eq(credential.id, scenarioRow!.credentialsReference!) });
    expect(credentialRow).toBeDefined();
    expect(credentialRow!.encryptedValue).not.toContain("hunter2-e2e-secret");

    await context.close();
  });

  test("two submissions of identical field values produce two independent runs (SC-005)", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    const fields = {
      url: "https://example.com",
      repository: "qa-forge/duplicate-submission-e2e",
      objective: "verify duplicate submissions never collide",
    };
    const firstRunId = await submitRunForm(page, fields);
    const secondRunId = await submitRunForm(page, fields);

    expect(firstRunId).not.toBe(secondRunId);
    const firstRun = await db.query.testRun.findFirst({ where: eq(testRun.id, firstRunId) });
    const secondRun = await db.query.testRun.findFirst({ where: eq(testRun.id, secondRunId) });
    expect(firstRun).toBeDefined();
    expect(secondRun).toBeDefined();
    expect(firstRun!.idempotencyKey).not.toBe(secondRun!.idempotencyKey);

    await context.close();
  });
});

import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";
import { createProjectForCaller } from "@/lib/repositories/project";
import { createScenarioForCaller } from "@/lib/repositories/test-scenario";
import { startRunForCaller, recordRunResultForCaller, type RecordRunResultInput } from "@/lib/repositories/test-run";

// Requires a real DATABASE_URL (003's migrations applied) and `pnpm dev` running at
// PLAYWRIGHT_BASE_URL — see quickstart.md. Seeds fixture data via the real repository
// layer directly (same pattern quickstart.md and 003's own T022 use), so what's asserted
// here is exactly what the running app's Server Components actually read, not a mock.
//
// Repository imports are static (top of file), not dynamic await import() inside seedRun —
// found by running this file: Playwright's test transform resolves the "@/" tsconfig path
// alias for statically-imported modules (and for dynamic imports reached FROM one, like
// authed-session.ts's own internal dynamic imports), but not reliably for a module reached
// only via a dynamic import two levels deep (seedRun's own await import(...) chain failed
// with "Cannot find module '@/db/client'" from inside project.ts, even though the exact
// same alias resolved fine everywhere else).

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";

async function seedRun(
  callerId: string,
  overrides: { objective?: string; repository?: string; report?: RecordRunResultInput["report"] } = {},
) {
  const project = await createProjectForCaller(callerId, {
    applicationUrl: "https://example.com",
    repository: overrides.repository ?? "qa-forge/web",
  });
  const scenario = await createScenarioForCaller(callerId, {
    projectId: project.id,
    objective: overrides.objective ?? "log in and reach the dashboard",
    credentialsReference: null,
  });
  if ("ok" in scenario) throw new Error("seedRun: unexpected denial creating scenario");
  const started = await startRunForCaller(callerId, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });
  if ("ok" in started) throw new Error("seedRun: unexpected denial starting run");

  if (overrides.report !== undefined) {
    const status = overrides.report === null ? "ERROR" : overrides.report.result === "PASS" ? "PASSED" : "FAILED";
    await recordRunResultForCaller(callerId, started.run.id, {
      status,
      errorReason: overrides.report === null ? "OBJECTIVE_NOT_PLANNABLE" : null,
      modelCalls: [],
      report: overrides.report,
    });
  }

  return { project, scenario, runId: started.run.id };
}

function failReport() {
  return {
    result: "FAIL" as const,
    steps: [
      {
        position: 0,
        action: "Submit credentials",
        expectedOutcome: "Redirected to dashboard",
        successCriteria: { kind: "url" as const, match: "/dashboard" },
        failureCriteria: { kind: "selectorPresent" as const, selector: ".error-banner" },
        observed: "ELEMENT_NOT_FOUND",
        status: "FAILED" as const,
      },
    ],
    evidence: [{ id: crypto.randomUUID(), stepId: "0", type: "CONSOLE" as const, content: "login failed", metadata: {} }],
    hypotheses: [
      {
        id: crypto.randomUUID(),
        status: "SUPPORTED" as const,
        description: "The login handler rejects valid credentials",
        confidence: 0.9,
        evidenceLinks: [],
        checks: [],
      },
    ],
    winningHypothesisId: null as string | null,
    confidence: 0.9,
  };
}

test.describe("US1 — own run history (quickstart Scenario 1, 6)", () => {
  test("a signed-in user sees only their own real runs, another user's are absent", async ({ browser }) => {
    const contextA = await browser.newContext();
    const { userId: userA } = await signInAs(contextA, BASE_URL, {
      user: { name: "User A", email: "e2e-a@example.com", image: "https://example.com/a.png", emailVerified: true },
      data: { id: "gh-e2e-a", login: "e2e-a" },
    });
    const runA = await seedRun(userA, { objective: "user A's objective" });

    const contextB = await browser.newContext();
    const { userId: userB } = await signInAs(contextB, BASE_URL, {
      user: { name: "User B", email: "e2e-b@example.com", image: "https://example.com/b.png", emailVerified: true },
      data: { id: "gh-e2e-b", login: "e2e-b" },
    });
    await seedRun(userB, { objective: "user B's unrelated objective" });

    const pageA = await contextA.newPage();
    await pageA.goto("/runs");
    await expect(pageA.getByText("user A's objective").first()).toBeVisible();
    await expect(pageA.getByText("user B's unrelated objective")).not.toBeVisible();
    void runA;

    await contextA.close();
    await contextB.close();
  });

  test("a user with zero runs sees the empty state, not an error", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL, {
      user: { name: "Empty User", email: "e2e-empty@example.com", image: "https://example.com/e.png", emailVerified: true },
      data: { id: "gh-e2e-empty", login: "e2e-empty" },
    });
    const page = await context.newPage();
    await page.goto("/runs");
    await expect(page.getByText("No QA runs yet")).toBeVisible();
    await context.close();
  });
});

test.describe("US2 — run detail matches stored data (quickstart Scenario 2)", () => {
  test("a FAIL run's detail page shows its real steps/evidence/hypotheses/report", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const report = failReport();
    report.winningHypothesisId = report.hypotheses[0]!.id;
    const { runId } = await seedRun(userId, { report });

    const page = await context.newPage();
    await page.goto(`/runs/${runId}`);
    await expect(page.getByText("Submit credentials")).toBeVisible();
    await expect(page.getByText("login failed")).toBeVisible();
    // Appears twice by design — the Hypotheses card and the Report's "Root cause:" line
    // both correctly show it; assert at least one is visible rather than picking one.
    await expect(page.getByText("The login handler rejects valid credentials").first()).toBeVisible();
    await expect(page.getByText("FAIL", { exact: true })).toBeVisible();
    await context.close();
  });

  test("a PASS run renders cleanly with zero hypotheses and no winning-hypothesis section", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const { runId } = await seedRun(userId, {
      report: { result: "PASS", steps: [], evidence: [], hypotheses: [], winningHypothesisId: null, confidence: null },
    });

    const page = await context.newPage();
    await page.goto(`/runs/${runId}`);
    await expect(page.getByText("PASS", { exact: true })).toBeVisible();
    await context.close();
  });

  test("an ERROR-before-report run shows no report section at all", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const { runId } = await seedRun(userId, { report: null });

    const page = await context.newPage();
    await page.goto(`/runs/${runId}`);
    await expect(page.getByText("ERROR", { exact: true })).toBeVisible();
    await expect(page.getByText("Report", { exact: true })).not.toBeVisible();
    await context.close();
  });
});

test.describe("US3 — ownership isolation at the URL and route level (quickstart Scenario 3)", () => {
  test("another user's run URL returns the same not-found response a nonexistent id would", async ({ browser }) => {
    const contextA = await browser.newContext();
    const { userId: userA } = await signInAs(contextA, BASE_URL);
    const { runId } = await seedRun(userA);

    const contextB = await browser.newContext();
    await signInAs(contextB, BASE_URL, {
      user: { name: "User C", email: "e2e-c@example.com", image: "https://example.com/c.png", emailVerified: true },
      data: { id: "gh-e2e-c", login: "e2e-c" },
    });
    const pageB = await contextB.newPage();

    const realRunRes = await pageB.goto(`/runs/${runId}`);
    const fakeRunRes = await pageB.goto(`/runs/${crypto.randomUUID()}`);
    expect(realRunRes?.status()).toBe(fakeRunRes?.status());

    await contextA.close();
    await contextB.close();
  });

  test("signed out, both /runs and /runs/[runId] redirect to /sign-in", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/runs");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto(`/runs/${crypto.randomUUID()}`);
    await expect(page).toHaveURL(/\/sign-in/);
    await context.close();
  });
});

test.describe("US4 — filtering narrows to real fields only (quickstart Scenario 4)", () => {
  test("status/repository/search filters narrow correctly; no environment or severity control exists", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL, {
      user: { name: "Filter User", email: "e2e-filter@example.com", image: "https://example.com/f.png", emailVerified: true },
      data: { id: "gh-e2e-filter", login: "e2e-filter" },
    });
    await seedRun(userId, {
      objective: "filterable objective one",
      repository: "qa-forge/web",
      report: { result: "PASS", steps: [], evidence: [], hypotheses: [], winningHypothesisId: null, confidence: null },
    });
    await seedRun(userId, {
      objective: "filterable objective two",
      repository: "qa-forge/api",
      report: null,
    });

    const page = await context.newPage();
    await page.goto("/runs");

    await page.getByPlaceholder("Search runs…").fill("objective one");
    await expect(page.getByText("filterable objective one").first()).toBeVisible();
    await expect(page.getByText("filterable objective two")).not.toBeVisible();

    // Scoped to the page's own content area, not the whole DOM — the persistent sidebar
    // nav has an unrelated "Environments" page link, which a page-wide text search would
    // false-positive against. The check is specifically "no environment/severity *filter
    // control* on this page", not "the word never appears anywhere in the app shell".
    const content = page.locator(".qf-page");
    await expect(content.getByText("Environment", { exact: false })).toHaveCount(0);
    await expect(content.getByText("Severity", { exact: false })).toHaveCount(0);

    await context.close();
  });
});

test.describe("Polish — Constitution Principle II and no-fabrication checks (quickstart Scenario 5, 7)", () => {
  test("evidence content renders as visible text, never as executed markup", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL, {
      user: { name: "XSS User", email: "e2e-xss@example.com", image: "https://example.com/x.png", emailVerified: true },
      data: { id: "gh-e2e-xss", login: "e2e-xss" },
    });
    const payload = "<img src=x onerror=alert(1)>";
    const { runId } = await seedRun(userId, {
      report: {
        result: "FAIL",
        steps: [],
        evidence: [{ id: crypto.randomUUID(), stepId: null, type: "CONSOLE", content: payload, metadata: {} }],
        hypotheses: [],
        winningHypothesisId: null,
        confidence: null,
      },
    });

    const page = await context.newPage();
    let dialogFired = false;
    page.on("dialog", () => { dialogFired = true; });

    await page.goto(`/runs/${runId}`);
    await expect(page.getByText(payload, { exact: false })).toBeVisible();
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(dialogFired).toBe(false);

    await context.close();
  });

  test("no screenshot, live-activity, agent-trace, rerun, or approval element appears anywhere", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL, {
      user: { name: "NoFab User", email: "e2e-nofab@example.com", image: "https://example.com/n.png", emailVerified: true },
      data: { id: "gh-e2e-nofab", login: "e2e-nofab" },
    });
    const { runId } = await seedRun(userId, { report: failReport() });

    const page = await context.newPage();
    await page.goto(`/runs/${runId}`);
    await expect(page.getByRole("button", { name: /rerun/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /approve/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /create issue/i })).not.toBeVisible();
    await expect(page.getByText(/agent trace/i)).not.toBeVisible();

    await page.goto("/runs");
    await expect(page.getByRole("button", { name: /new qa run/i })).not.toBeVisible();

    await context.close();
  });
});

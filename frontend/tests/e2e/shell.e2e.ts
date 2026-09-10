import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";
import { createProjectForCaller } from "@/lib/repositories/project";
import { createScenarioForCaller } from "@/lib/repositories/test-scenario";
import { startRunForCaller } from "@/lib/repositories/test-run";

// Proves AppShell reads real data (getShellCountsForCaller) instead of the qaforge.ts
// mock's runs/findings/approvals — same seeding pattern approval.e2e.ts and
// run-history-view.e2e.ts already use (real repository functions, not a live investigation
// run). Also proves the notification bell no longer targets the deleted /agent-activity
// route, and that a narrow viewport renders the real page instead of the old fully-mock
// MobileReview screen.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";

test.describe("AppShell/real-data", () => {
  test("the sidebar Runs badge reflects this caller's real live-run count", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const project = await createProjectForCaller(userId, { applicationUrl: "https://example.com", repository: "qa-forge/shell-e2e" });
    const scenario = await createScenarioForCaller(userId, { projectId: project.id, objective: "load the homepage", credentialsReference: null });
    if ("ok" in scenario) throw new Error("unexpected denial creating scenario");
    await startRunForCaller(userId, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });
    await startRunForCaller(userId, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });

    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.locator('[data-slot="sidebar-menu-badge"]')).toHaveText("2");
    await context.close();
  });

  test("the notification bell no longer targets the deleted /agent-activity route", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await context.close();
  });

  test("a narrow viewport renders the real page, not a mock mobile screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await signInAs(context, BASE_URL);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await context.close();
  });
});

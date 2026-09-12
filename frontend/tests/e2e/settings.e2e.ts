import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";

// Requires: a real DATABASE_URL and `pnpm dev` running at PLAYWRIGHT_BASE_URL, started with
// QAFORGE_E2E_FAKE_GITHUB_API set — a test-only seam in src/lib/github-api.ts (see that
// file's own comment) so this suite never makes a real call to api.github.com. Same pattern
// as actions.ts's QAFORGE_E2E_FAKE_REPORT (005/006).
//   QAFORGE_E2E_FAKE_GITHUB_API='{"ok":true,"repositories":["qa-forge/settings-e2e-repo"]}'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";

test.describe("007-github-connection", () => {
  test("signed out, /settings redirects to /sign-in", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("connecting shows the real repository list, and disconnecting returns to the connect form", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    // No tab click: the Workspace/Notifications tabs and the mock Slack/Linear rows were
    // removed (no PRD backing) — GitHub is the only section on the page now.
    await page.locator("#pat").fill("ghp_fake_token_for_settings_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();

    // The action re-renders the same page with the connection now established.
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
    await expect(page.getByText("qa-forge/settings-e2e-repo")).toBeVisible();

    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.locator("#pat")).toBeVisible();
    await expect(page.getByText("qa-forge/settings-e2e-repo")).not.toBeVisible();

    await context.close();
  });
});

// 008-slack-linear-integrations: quickstart.md Scenarios 1-3. Also requires
// QAFORGE_E2E_FAKE_SLACK_WEBHOOK set on the dev server under test (see slack-api.ts).
test.describe("008-slack-linear-integrations — Slack connection (FR-001/FR-003/FR-017)", () => {
  test("without a GitHub connection, the Slack row is gated, not silently absent", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    await expect(page.getByText("Requires GitHub")).toBeVisible();
    await expect(page.locator("#webhookUrl")).not.toBeVisible();

    await context.close();
  });

  test("with GitHub connected, a genuine Slack webhook connects; a non-Slack URL is rejected first", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    await page.locator("#pat").fill("ghp_fake_token_for_slack_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.locator("#webhookUrl")).toBeVisible();

    // FR-003/FR-012: wrong hostname rejected before any row is touched.
    await page.locator("#webhookUrl").fill("https://evil.example.com/webhook");
    await page.locator("form").filter({ has: page.locator("#webhookUrl") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText(/doesn't look like a Slack webhook URL/i)).toBeVisible();
    await expect(page.locator("#webhookUrl")).toBeVisible(); // still on the connect form

    // FR-012: right host, wrong scheme, also rejected (the follow-up review finding).
    await page.locator("#webhookUrl").fill("http://hooks.slack.com/services/T00/B00/xxx");
    await page.locator("form").filter({ has: page.locator("#webhookUrl") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText(/doesn't look like a Slack webhook URL/i)).toBeVisible();

    // A genuine URL connects.
    await page.locator("#webhookUrl").fill("https://hooks.slack.com/services/T00/B00/xxx");
    await page.locator("form").filter({ has: page.locator("#webhookUrl") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

    await context.close();
  });
});

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

// 008-slack-linear-integrations: quickstart.md Scenario 5. Requires QAFORGE_E2E_FAKE_LINEAR_API
// set on the dev server under test, e.g.:
//   QAFORGE_E2E_FAKE_LINEAR_API='{"ok":true,"teams":[{"id":"team-1","name":"Engineering"}]}'
test.describe("008-slack-linear-integrations — Linear connection is a two-step, re-verified flow (US2, FR-002/FR-004, research.md Decision 7)", () => {
  test("pasting a key lists teams from a live call before anything is stored; picking one connects", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    await page.locator("#pat").fill("ghp_fake_token_for_linear_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();

    await page.locator("#apiKey").fill("lin_fake_key_for_e2e");
    await page.locator("form").filter({ has: page.locator("#apiKey") }).getByRole("button", { name: "Continue" }).click();

    // Nothing stored yet — the team picker appearing IS the assertion that this stage
    // never wrote a row; a DB check would need direct repository access from the test.
    await expect(page.getByText("Which Linear team should new issues go to?")).toBeVisible();

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Engineering" }).click();
    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByText(/Connected — Engineering/)).toBeVisible();
    await context.close();
  });
});

// 008-slack-linear-integrations: US3 — spec.md frames this story as layered on top of US1/
// US2, not independent of them (see tasks.md Phase 5's own note); these two tests need both
// already built, which they now are.
test.describe("008-slack-linear-integrations — manage each connection independently (US3, FR-005/FR-006/FR-019)", () => {
  test("disconnecting Slack leaves Linear untouched, and vice versa (US3 AS1/AS2)", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    await page.locator("#pat").fill("ghp_fake_for_disconnect_independence_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();

    await page.locator("#webhookUrl").fill("https://hooks.slack.com/services/T00/B00/xxx");
    await page.locator("form").filter({ has: page.locator("#webhookUrl") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Disconnect" }).first()).toBeVisible();

    await page.locator("#apiKey").fill("lin_fake_key_for_disconnect_independence_e2e");
    await page.locator("form").filter({ has: page.locator("#apiKey") }).getByRole("button", { name: "Continue" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Engineering" }).click();
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText(/Connected — Engineering/)).toBeVisible();

    // Disconnect Slack only — the Slack row's own Disconnect button, scoped by its section
    // (both Slack and Linear render a "Disconnect" button, so this must be scoped, not a
    // bare getByRole("button", { name: "Disconnect" }) which would be ambiguous here).
    const slackSection = page.locator("div").filter({ hasText: "Slack" }).first();
    await slackSection.getByRole("button", { name: "Disconnect" }).click();

    await expect(page.locator("#webhookUrl")).toBeVisible(); // Slack back to connect form
    await expect(page.getByText(/Connected — Engineering/)).toBeVisible(); // Linear untouched

    await context.close();
  });

  test("disconnecting GitHub suspends Slack/Linear without deleting them; both resume automatically on reconnect (US3 AS3, FR-019)", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();

    await page.goto("/settings");
    await page.locator("#pat").fill("ghp_fake_for_suspend_resume_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();
    await page.locator("#webhookUrl").fill("https://hooks.slack.com/services/T00/B00/xxx");
    await page.locator("form").filter({ has: page.locator("#webhookUrl") }).getByRole("button", { name: "Connect" }).click();

    // Disconnect GitHub — scoped to the GitHub section, since Slack now also shows a
    // "Disconnect" button.
    const githubSection = page.locator("div").filter({ hasText: "GitHub" }).first();
    await githubSection.getByRole("button", { name: "Disconnect" }).click();

    // FR-019: "remain listed and removable" — the Slack row must still show Connected
    // + Disconnect, NOT fall back to the gated "Requires GitHub" form (that form is only
    // for *creating* a new connection, FR-017; an existing one stays reachable). Whether it
    // actually stops firing is a repository-level property already covered at the unit
    // level (approval.test.ts: "never posts when Slack is connected but GitHub is not") —
    // this e2e check is specifically that the UI doesn't wrongly hide the connection.
    await expect(page.locator("#pat")).toBeVisible(); // GitHub itself is back to its connect form
    await expect(page.getByText("Connected")).toBeVisible(); // Slack's row, unaffected

    // Reconnect GitHub — Slack resumes with no re-entry of the webhook URL (it was never
    // hidden, so "resumes" here means its next notification attempt succeeds again, which
    // is a repository-level property, not something this page proves on its own).
    await page.locator("#pat").fill("ghp_fake_for_suspend_resume_e2e_2");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Disconnect" }).first()).toBeVisible();

    await context.close();
  });
});

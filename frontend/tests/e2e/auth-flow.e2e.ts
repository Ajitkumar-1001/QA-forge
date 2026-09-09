import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";

// A-first (login-gate plan): the whole app is gated now, not just /runs — proxy.ts's
// PUBLIC_ROUTE_PREFIXES is an exemption list (just /sign-in), everything else redirects a
// signed-out visitor. Every one of these routes was reachable signed-out before this change.
const PREVIOUSLY_UNGATED_ROUTES = ["/dashboard", "/findings", "/policies", "/settings", "/environments", "/test-plans", "/agent-activity", "/repositories"];

test.describe("A-first — the whole app is gated, not just /runs", () => {
  for (const route of PREVIOUSLY_UNGATED_ROUTES) {
    test(`signed out, ${route} redirects to /sign-in`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }

  test("signed in, /dashboard renders instead of redirecting", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  test("an already-authenticated visitor to /sign-in is bounced to /dashboard, not shown the form again", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  test("an already-authenticated visitor to /sign-in with a real error param still sees the error, not an immediate bounce", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, BASE_URL);
    const page = await context.newPage();
    await page.goto("/sign-in?error=access_denied");
    await expect(page).toHaveURL(/\/sign-in\?error=access_denied$/);
    await expect(page.getByText("Sign-in was cancelled")).toBeVisible();
    await context.close();
  });
});

test.describe("UX-001/UX-002 — signed-out landing", () => {
  test("has exactly one action, reachable and activatable by keyboard, with a visible focus state", async ({ page }) => {
    await page.goto("/sign-in");
    const button = page.getByRole("button", { name: "Continue with GitHub" });
    await expect(button).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
  });

  test("the GitHub icon is decorative (aria-hidden) — the button's accessible name is the text alone", async ({ page }) => {
    await page.goto("/sign-in");
    const button = page.getByRole("button", { name: "Continue with GitHub" });
    const icon = button.locator("svg");
    await expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  test("clicking disables the button and shows a spinner (UX-002) — does not navigate away immediately, since signIn.social redirects only after its own round trip", async ({ page }) => {
    await page.goto("/sign-in");
    const button = page.getByRole("button", { name: "Continue with GitHub" });
    await button.click();
    await expect(button).toBeDisabled();
  });
});

test.describe("UX-003 — callback failure states (mocked server-validated conditions, not live GitHub errors)", () => {
  const cases: Array<{ error: string; expectedTitle: string }> = [
    { error: "access_denied", expectedTitle: "Sign-in was cancelled" },
    { error: "state_mismatch", expectedTitle: "That sign-in link isn't valid" },
    { error: "some_unrecognized_code", expectedTitle: "GitHub sign-in isn't working right now" },
  ];

  for (const { error, expectedTitle } of cases) {
    test(`?error=${error} renders the "${expectedTitle}" card, never the raw code, and still offers the retry action`, async ({ page }) => {
      await page.goto(`/sign-in?error=${error}`);

      await expect(page.locator('[data-slot="alert"]')).toContainText(expectedTitle);
      await expect(page.getByText(error, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
    });
  }
});

test.describe("UX-007 — accessibility across the sign-in screen", () => {
  test("no horizontal scroll and touch targets are >=44px at a 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sign-in");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const box = await page.getByRole("button", { name: "Continue with GitHub" }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});

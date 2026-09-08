import { expect, test } from "playwright/test";

const STAGING_URL = process.env.STAGING_URL;
const AUTH_STATE_PATH = process.env.STAGING_AUTH_STATE_PATH;

test.skip(!STAGING_URL || !AUTH_STATE_PATH, "Needs a real staging deployment (T004/T005) — not available in this environment.");

test.use({ baseURL: STAGING_URL, storageState: AUTH_STATE_PATH });

test.describe("Live staging — real cookie attributes and sign-out invalidation", () => {
  test("the session cookie is httpOnly, Secure, and SameSite=Lax (SEC-003)", async ({ context }) => {
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "better-auth.session_token");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
  });

  test("signing out and replaying the captured cookie is treated as unauthenticated (SC-002)", async ({ page, context }) => {
    const before = await context.cookies();
    const capturedSessionCookie = before.find((c) => c.name === "better-auth.session_token")!;

    await page.goto("/");
    await page.request.post("/api/auth/sign-out");

    const replay = await page.request.get("/api/auth/get-session", {
      headers: { cookie: `better-auth.session_token=${capturedSessionCookie.value}` },
    });
    const body = await replay.json();
    expect(body).toBeNull();
  });
});

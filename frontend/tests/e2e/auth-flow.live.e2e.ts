import { expect, test } from "playwright/test";

// Live-staging half (tasks.md T040) — what tests/e2e/auth-flow.e2e.ts's fixture/mocked half
// structurally CANNOT prove: real cookie attributes off an actual Set-Cookie header
// (httpOnly/Secure/SameSite=Lax, SEC-003), and real sign-out invalidation against the real
// adapter/DB (SC-002) — not Better Auth's in-memory adapter.
//
// NOT RUNNABLE HERE: this needs T004 (a real Vercel staging deployment) and T005 (a real GitHub
// OAuth App registered against its callback URL) — as of this feature's implementation, neither
// exists (tasks.md's own T004/T005 entries are still unchecked, requiring manual action this
// agent cannot perform: Vercel account/dashboard access, GitHub OAuth App creation has no API).
// This file is the structure to run once they do, not something that ran during this feature's
// implementation — skip-guarded rather than left to silently pass or fail against nothing.
//
// To actually run this once staging exists:
//   1. Set STAGING_URL to the real deployed domain.
//   2. Complete a real GitHub sign-in once by hand in a browser pointed at STAGING_URL, capture
//      the resulting storage state (`await context.storageState({ path })`), and set
//      STAGING_AUTH_STATE_PATH to that file — Playwright's documented pattern for a login flow
//      an automated run can't drive itself (GitHub's own login form is out of this feature's
//      control, and no test credentials exist to script it).
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

    // Replay the pre-logout cookie value directly against the session-check endpoint.
    const replay = await page.request.get("/api/auth/get-session", {
      headers: { cookie: `better-auth.session_token=${capturedSessionCookie.value}` },
    });
    const body = await replay.json();
    expect(body).toBeNull();
  });
});

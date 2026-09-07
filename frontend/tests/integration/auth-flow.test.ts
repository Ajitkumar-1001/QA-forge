import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// betterAuth() construction needs these; no live DB is touched — every test builds its own
// instance against Better Auth's in-memory adapter (no Postgres exists in this environment —
// see quickstart.md Scenario 2 / tasks.md T020 for the real-DB caveat that applies to that test,
// not this one, since nothing here depends on Postgres-specific transaction/constraint behavior).
process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.GITHUB_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

type TestDb = Record<"user" | "session" | "account" | "verification", Record<string, unknown>[]>;

const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const FAKE_PROFILE = {
  user: { name: "Ada Lovelace", email: "ada@example.com", image: "https://x/y.png", emailVerified: true },
  data: { id: "gh-1", login: "ada" },
};

let buildAuthOptions: typeof import("@/lib/auth").buildAuthOptions;

beforeEach(async () => {
  ({ buildAuthOptions } = await import("@/lib/auth"));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const href = String((url as { url?: string })?.url ?? url);
      if (href.includes(GITHUB_TOKEN_ENDPOINT)) {
        return new Response(JSON.stringify({ access_token: "fake-gh-access-token", token_type: "bearer", scope: "read:user,user:email" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch in test: ${href}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fresh betterAuth() instance + its backing in-memory store, per test — no cross-test state. */
async function createTestAuth(getUserInfo: () => Promise<typeof FAKE_PROFILE> = async () => FAKE_PROFILE) {
  const { betterAuth } = await import("better-auth");
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const db: TestDb = { user: [], session: [], account: [], verification: [] };
  const options = buildAuthOptions({ database: memoryAdapter(db) }) as ReturnType<typeof buildAuthOptions> & {
    socialProviders: { github: { getUserInfo?: typeof getUserInfo } };
  };
  options.socialProviders.github.getUserInfo = getUserInfo;
  // A fake profile fixture only needs the fields the account-linking path actually reads
  // (accountSubject reads `data.id`; the rest flows straight into `user`) — not GithubProfile's
  // full ~35-field shape. Cast at this boundary rather than fabricate the rest.
  const auth = betterAuth({ ...options, baseURL: "http://localhost:3000" } as Parameters<typeof betterAuth>[0]) as unknown as {
    api: {
      signInSocial: (args: unknown) => Promise<Response>;
      callbackOAuth: (args: unknown) => Promise<Response>;
      signOut: (args: unknown) => Promise<Response>;
      getSession: (args: unknown) => Promise<{ session: unknown; user: unknown } | null>;
    };
  };
  return { auth, db };
}

/** Drives the sign-in half of the flow — the part identical across every scenario below. */
async function startSignIn(auth: Awaited<ReturnType<typeof createTestAuth>>["auth"]) {
  const res = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: "/dashboard" },
    asResponse: true,
  });
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { state, cookie };
}

describe("GitHub OAuth end-to-end (US1, FR-001/FR-002, mocked provider)", () => {
  it("a new identity creates exactly one User+Account, with no OAuth token persisted (SEC-002)", async () => {
    const { auth, db } = await createTestAuth();
    const { state, cookie } = await startSignIn(auth);

    const res = await auth.api.callbackOAuth({
      params: { id: "github" },
      query: { code: "fake-code", state },
      headers: new Headers({ cookie }),
      asResponse: true,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(db.user).toHaveLength(1);
    expect(db.account).toHaveLength(1);
    expect(db.session).toHaveLength(1);
    const account = db.account[0] as Record<string, unknown>;
    // T022/SEC-002: stripped at write time, not merely absent from this fake response.
    expect(account.accessToken).toBeUndefined();
    expect(account.refreshToken).toBeUndefined();
    expect(account.idToken).toBeUndefined();
  });

  it("a returning identity resolves to the same User, not a new one (FR-002)", async () => {
    const { auth, db } = await createTestAuth();

    const first = await startSignIn(auth);
    await auth.api.callbackOAuth({ params: { id: "github" }, query: { code: "c1", state: first.state }, headers: new Headers({ cookie: first.cookie }), asResponse: true });
    const firstUserId = (db.user[0] as { id: string }).id;

    const second = await startSignIn(auth);
    await auth.api.callbackOAuth({ params: { id: "github" }, query: { code: "c2", state: second.state }, headers: new Headers({ cookie: second.cookie }), asResponse: true });

    expect(db.user).toHaveLength(1);
    expect(db.account).toHaveLength(1);
    expect((db.user[0] as { id: string }).id).toBe(firstUserId);
    // T022's second fix, the one a create-only hook would have missed: the returning-sign-in
    // path calls updateAccount, not createAccount — assert the row is still clean after it runs.
    expect((db.account[0] as Record<string, unknown>).accessToken).toBeUndefined();
  });

  it("denying the GitHub authorization prompt leaves no User/Account/Session row (Edge Cases)", async () => {
    const { auth, db } = await createTestAuth();
    const { state, cookie } = await startSignIn(auth);

    const res = await auth.api.callbackOAuth({
      params: { id: "github" },
      query: { error: "access_denied", state },
      headers: new Headers({ cookie }),
      asResponse: true,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=access_denied");
    expect(db.user).toHaveLength(0);
    expect(db.account).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it("a callback with a state that doesn't match any issued sign-in is rejected (SEC-004)", async () => {
    const { auth, db } = await createTestAuth();
    const { cookie } = await startSignIn(auth);

    const res = await auth.api.callbackOAuth({
      params: { id: "github" },
      query: { code: "fake-code", state: "not-a-state-that-was-ever-issued" },
      headers: new Headers({ cookie }),
      asResponse: true,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=state_mismatch");
    expect(db.user).toHaveLength(0);
    expect(db.account).toHaveLength(0);
  });
});

describe("Sign out and session termination (US3, FR-004, SC-002, quickstart Scenario 4)", () => {
  it("sign-out invalidates the Session row; the replayed pre-logout cookie is treated as unauthenticated", async () => {
    const { auth, db } = await createTestAuth();
    const { state, cookie: preSignInCookie } = await startSignIn(auth);
    const callbackRes = await auth.api.callbackOAuth({
      params: { id: "github" },
      query: { code: "fake-code", state },
      headers: new Headers({ cookie: preSignInCookie }),
      asResponse: true,
    });
    // The full Set-Cookie header can carry both the cleared state cookie and the new session
    // cookie — take the session one specifically (the state cookie is already spent/irrelevant).
    const sessionCookie = callbackRes.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="))!
      .split(";")[0];
    expect(db.session).toHaveLength(1);

    // Captured before logout — this is exactly the cookie an attacker replaying a stolen session
    // would have (SC-002's scenario).
    const capturedCookie = sessionCookie;

    const preLogoutSession = await auth.api.getSession({ headers: new Headers({ cookie: capturedCookie }) });
    expect(preLogoutSession).not.toBeNull();

    const signOutRes = await auth.api.signOut({ headers: new Headers({ cookie: sessionCookie }), asResponse: true });
    expect(signOutRes.status).toBeLessThan(400);
    expect(db.session).toHaveLength(0); // FR-004: the Session row is actually deleted server-side.

    const replayed = await auth.api.getSession({ headers: new Headers({ cookie: capturedCookie }) });
    expect(replayed).toBeNull(); // SC-002: replaying the pre-logout cookie is unauthenticated.
  });
});

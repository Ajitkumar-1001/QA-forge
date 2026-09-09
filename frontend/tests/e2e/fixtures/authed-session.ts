import type { BrowserContext } from "playwright/test";

// Mints a real, valid Better Auth session against the app's actual DATABASE_URL (the same
// DB the dev server under test reads from) and injects it into a Playwright browser
// context — so a page navigation in the test is genuinely signed in, not stubbed at the
// page layer. Assembled from the two mocking mechanisms
// tests/integration/auth-flow.test.ts already proves work together for this exact
// signInSocial -> callbackOAuth flow:
//   1. A global fetch stub for GitHub's token-exchange endpoint only (everything else
//      passes through) — auth-flow.test.ts's beforeEach does the same.
//   2. socialProviders.github.getUserInfo overridden directly at the config level,
//      bypassing whatever real HTTP call it would otherwise make — auth-flow.test.ts's
//      createTestAuth() does the same.
//
// Deliberately does NOT import src/lib/auth.ts (verified by running this file, first
// attempt): merely importing that module crashes outside a real Next.js process —
// better-auth/next-js's nextCookies() plugin (which src/lib/auth.ts's buildAuthOptions
// unconditionally includes) reaches into Next's internal cookies runtime module and throws
// ("...is from a module not been linked") when loaded in a bare Node/Playwright process.
// nextCookies() only matters for auto-setting cookies via next/headers when Better Auth is
// called from inside a Server Action/Route Handler; auth.api.X({asResponse:true}) already
// returns a plain Response with its own Set-Cookie header regardless, so it isn't needed
// here. `withHashedSessionToken` below is copied from src/lib/auth.ts for the same reason
// (importing it would re-trigger the same module-evaluation crash) — it must match exactly,
// since the real dev server hashes an incoming cookie's token before its own session
// lookup; a test session minted without this wrapper would store the raw token and the
// real server's lookup would never find it.

// Unique per call by default (verified by running this file under Playwright's real
// parallel workers, not just --workers=1): a shared hardcoded identity across tests that
// don't otherwise need to share one raced on the real user.email UNIQUE constraint —
// exactly the concurrent-first-signup class 002-auth-ownership's FR-014 names — and one
// concurrent signInSocial/callbackOAuth genuinely lost that race with unable_to_create_user.
// That's the app behaving correctly under a real collision, not a product bug; the fix
// belongs here, in the fixture, not in the app.
function defaultProfile() {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    user: { name: "E2E Test User", email: `e2e-${id}@example.com`, image: "https://example.com/avatar.png", emailVerified: true },
    data: { id: `gh-e2e-${id}`, login: `e2e-${id}` },
  };
}

const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const SESSION_MODEL = "session";

// --- copied verbatim from src/lib/auth.ts (see note above for why) ---
function hashWhere(hashSessionToken: (t: string) => string, where: unknown[] | undefined) {
  const rawByHash = new Map<string, string>();
  const mapped = (where as { field: string; value: unknown }[] | undefined)?.map((clause) => {
    if (clause.field !== "token") return clause;
    const { value } = clause;
    if (typeof value === "string") {
      const hash = hashSessionToken(value);
      rawByHash.set(hash, value);
      return { ...clause, value: hash };
    }
    if (Array.isArray(value)) {
      const hashed = value.map((v) => {
        if (typeof v !== "string") return v;
        const hash = hashSessionToken(v);
        rawByHash.set(hash, v);
        return hash;
      });
      return { ...clause, value: hashed };
    }
    return clause;
  });
  return { where: mapped, rawByHash };
}

function restoreToken<T>(row: T | null, rawByHash: Map<string, string>): T | null {
  if (!row || typeof row !== "object" || !("token" in row)) return row;
  const hashed = (row as { token: unknown }).token;
  if (typeof hashed === "string" && rawByHash.has(hashed)) {
    return { ...row, token: rawByHash.get(hashed) };
  }
  return row;
}

interface MinimalAdapter {
  create: (params: { model: string; data: Record<string, unknown> }) => Promise<unknown>;
  findOne: (params: { model: string; where?: unknown[] }) => Promise<unknown>;
  findMany: (params: { model: string; where?: unknown[] }) => Promise<unknown[]>;
  update: (params: { model: string; where?: unknown[]; update: Record<string, unknown> }) => Promise<unknown>;
  [key: string]: unknown;
}

function withHashedSessionToken(createAdapter: (o: unknown) => MinimalAdapter, hashSessionToken: (t: string) => string) {
  return (options: unknown) => {
    const inner = createAdapter(options);
    return {
      ...inner,
      create: async (params: { model: string; data: Record<string, unknown> }) => {
        if (params.model !== SESSION_MODEL || typeof params.data.token !== "string") return inner.create(params);
        const rawToken = params.data.token;
        const row = await inner.create({ ...params, data: { ...params.data, token: hashSessionToken(rawToken) } });
        return restoreToken(row, new Map([[hashSessionToken(rawToken), rawToken]]));
      },
      findOne: (params: { model: string; where?: unknown[] }) => {
        if (params.model !== SESSION_MODEL) return inner.findOne(params);
        const { where, rawByHash } = hashWhere(hashSessionToken, params.where);
        return inner.findOne({ ...params, where: where ?? params.where }).then((row: unknown) => restoreToken(row, rawByHash));
      },
      findMany: (params: { model: string; where?: unknown[] }) => {
        if (params.model !== SESSION_MODEL) return inner.findMany(params);
        const { where, rawByHash } = hashWhere(hashSessionToken, params.where);
        return inner
          .findMany({ ...params, where: where ?? params.where })
          .then((rows: unknown[]) => rows.map((row) => restoreToken(row, rawByHash)));
      },
      update: (params: { model: string; where?: unknown[]; update: Record<string, unknown> }) => {
        if (params.model !== SESSION_MODEL) return inner.update(params);
        const { where, rawByHash } = hashWhere(hashSessionToken, params.where);
        const update = { ...params.update };
        if (typeof update.token === "string") {
          const hash = hashSessionToken(update.token);
          rawByHash.set(hash, update.token);
          update.token = hash;
        }
        return inner.update({ ...params, where: where ?? params.where, update }).then((row: unknown) => restoreToken(row, rawByHash));
      },
    };
  };
}
// --- end copied section ---

export async function signInAs(
  context: BrowserContext,
  baseURL: string,
  profile: ReturnType<typeof defaultProfile> = defaultProfile(),
): Promise<{ userId: string }> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const href = String((url as { url?: string } | undefined)?.url ?? url);
    if (href.includes(GITHUB_TOKEN_ENDPOINT)) {
      return new Response(
        JSON.stringify({ access_token: "fake-gh-access-token", token_type: "bearer", scope: "read:user,user:email" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(url as never, init as never);
  }) as typeof fetch;

  try {
    const { betterAuth } = await import("better-auth");
    const { drizzleAdapter } = await import("better-auth/adapters/drizzle");
    const { hashSessionToken } = await import("@/lib/crypto");
    const { db } = await import("@/db/client");
    const schema = await import("@/db/schema");

    const testAuth = betterAuth({
      database: withHashedSessionToken(
        drizzleAdapter(db, { provider: "pg", schema, transaction: true }) as unknown as (o: unknown) => MinimalAdapter,
        hashSessionToken,
      ) as never,
      socialProviders: {
        github: {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          getUserInfo: (async () => profile) as never,
        },
      },
    }) as unknown as {
      api: {
        signInSocial: (args: unknown) => Promise<Response>;
        callbackOAuth: (args: unknown) => Promise<Response>;
      };
    };

    const startRes = await testAuth.api.signInSocial({
      body: { provider: "github", callbackURL: "/runs" },
      asResponse: true,
    });
    const state = new URL(startRes.headers.get("location")!).searchParams.get("state")!;
    const preSignInCookie = startRes.headers.get("set-cookie")!.split(";")[0]!;

    const callbackRes = await testAuth.api.callbackOAuth({
      params: { id: "github" },
      query: { code: "fake-code", state },
      headers: new Headers({ cookie: preSignInCookie }),
      asResponse: true,
    });

    const setCookies = (callbackRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie();
    const sessionCookieHeader = setCookies.find((c) => c.startsWith("better-auth.session_token="));
    if (!sessionCookieHeader) {
      throw new Error(`signInAs: no session cookie in callbackOAuth response — headers were: ${setCookies.join(" | ")}`);
    }
    const [nameValue] = sessionCookieHeader.split(";");
    const eq = nameValue!.indexOf("=");
    const name = nameValue!.slice(0, eq);
    const value = nameValue!.slice(eq + 1);

    const url = new URL(baseURL);
    await context.addCookies([
      { name, value, domain: url.hostname, path: "/", httpOnly: true, secure: url.protocol === "https:", sameSite: "Lax" },
    ]);

    const userRow = await db.query.user.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.email, profile.user.email) });
    if (!userRow) throw new Error("signInAs: sign-in completed but no matching user row was found");
    return { userId: userRow.id };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { hashSessionToken } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// T008 (research.md #8, Constitution Principle IV): hash Session.token before
// it reaches Postgres.
//
// Better Auth's own adapter stores it raw (verified against the installed
// better-auth@1.7.3's internal-adapter.mjs: `token: generateId(32)`, no hash)
// and has no `databaseHooks` read-path hook — only create/update/delete row
// hooks exist, none of which can transform a `findOne`/`findMany` WHERE
// value. So this wraps the adapter itself: every session `create`/`update`
// call hashes `token` before delegating, every call with a `field: "token"`
// WHERE entry hashes the query value before delegating, and every returned
// row gets its raw (pre-hash) token restored before it reaches Better Auth's
// own code — so nothing outside this wrapper ever needs to know hashing
// happens, including the cookie the sign-in flow sets.
//
// Scope, deliberately: this wraps the operations Better Auth's session
// internals actually use today (create, findOne, findMany, update, delete,
// plus count/updateMany/deleteMany/consumeOne/incrementOne for completeness,
// all cheap to include via the same where-clause helper). It does NOT
// recursively wrap `.transaction()`'s callback adapter — no code path
// creates or updates a session inside a transaction today (FR-014's
// transaction is User+Account only); add that wrapping if a future Better
// Auth version or plugin changes that.
type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type AdapterWhere = NonNullable<Parameters<Adapter["findOne"]>[0]["where"]>;

const SESSION_MODEL = "session";

function hashWhere(where: AdapterWhere | undefined): {
  where: AdapterWhere | undefined;
  rawByHash: Map<string, string>;
} {
  const rawByHash = new Map<string, string>();
  const mapped = where?.map((clause) => {
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
  return { where: mapped as AdapterWhere | undefined, rawByHash };
}

function restoreToken<T>(row: T | null, rawByHash: Map<string, string>): T | null {
  if (!row || typeof row !== "object" || !("token" in row)) return row;
  const hashed = (row as { token: unknown }).token;
  if (typeof hashed === "string" && rawByHash.has(hashed)) {
    return { ...row, token: rawByHash.get(hashed) };
  }
  return row;
}

function withHashedSessionToken(createAdapter: AdapterFactory): AdapterFactory {
  return (options) => {
    const inner = createAdapter(options);

    // Every wrapped method below is generic in the interface (`create<T,R>`,
    // `findOne<T>`, ...) but this wrapper's actual runtime shape is uniform:
    // "hash `token` going in, delegate, restore the raw value coming out."
    // TypeScript can't unify that uniform implementation against N separate
    // open generic signatures — the cast at the end of this function is a
    // single, deliberate boundary, not a general escape hatch; every method
    // body above it is fully typed against `Adapter`'s concrete parameter
    // shapes.
    const wrapped = {
      ...inner,
      create: async (params: Parameters<Adapter["create"]>[0]) => {
        const data = params.data as Record<string, unknown>;
        if (params.model !== SESSION_MODEL || typeof data.token !== "string") {
          return inner.create(params);
        }
        const rawToken = data.token;
        const row = (await inner.create({
          ...params,
          data: { ...data, token: hashSessionToken(rawToken) },
        })) as Record<string, unknown> | null;
        return restoreToken(row, new Map([[hashSessionToken(rawToken), rawToken]]));
      },
      findOne: (params: Parameters<Adapter["findOne"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.findOne(params);
        const { where, rawByHash } = hashWhere(params.where);
        return inner.findOne({ ...params, where: where ?? params.where }).then((row) => restoreToken(row, rawByHash));
      },
      findMany: (params: Parameters<Adapter["findMany"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.findMany(params);
        const { where, rawByHash } = hashWhere(params.where);
        return inner
          .findMany({ ...params, where: (where ?? params.where) as typeof params.where })
          .then((rows) => rows.map((row) => restoreToken(row, rawByHash)));
      },
      update: (params: Parameters<Adapter["update"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.update(params);
        const { where, rawByHash } = hashWhere(params.where);
        const update = { ...params.update } as Record<string, unknown>;
        if (typeof update.token === "string") {
          const raw = update.token;
          const hash = hashSessionToken(raw);
          update.token = hash;
          rawByHash.set(hash, raw);
        }
        return inner
          .update({ ...params, where: (where ?? params.where) as typeof params.where, update })
          .then((row) => restoreToken(row, rawByHash));
      },
      updateMany: (params: Parameters<Adapter["updateMany"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.updateMany(params);
        const { where } = hashWhere(params.where);
        return inner.updateMany({ ...params, where: (where ?? params.where) as typeof params.where });
      },
      delete: (params: Parameters<Adapter["delete"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.delete(params);
        const { where } = hashWhere(params.where);
        return inner.delete({ ...params, where: (where ?? params.where) as typeof params.where });
      },
      deleteMany: (params: Parameters<Adapter["deleteMany"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.deleteMany(params);
        const { where } = hashWhere(params.where);
        return inner.deleteMany({ ...params, where: (where ?? params.where) as typeof params.where });
      },
      count: (params: Parameters<Adapter["count"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.count(params);
        const { where } = hashWhere(params.where);
        return inner.count({ ...params, where: (where ?? params.where) as typeof params.where });
      },
      consumeOne: (params: Parameters<Adapter["consumeOne"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.consumeOne(params);
        const { where, rawByHash } = hashWhere(params.where);
        return inner
          .consumeOne({ ...params, where: (where ?? params.where) as typeof params.where })
          .then((row) => restoreToken(row, rawByHash));
      },
      incrementOne: (params: Parameters<Adapter["incrementOne"]>[0]) => {
        if (params.model !== SESSION_MODEL) return inner.incrementOne(params);
        const { where, rawByHash } = hashWhere(params.where);
        return inner
          .incrementOne({ ...params, where: (where ?? params.where) as typeof params.where })
          .then((row) => restoreToken(row, rawByHash));
      },
    };

    return wrapped as Adapter;
  };
}

// ---------------------------------------------------------------------------

// SEC-002: strip every OAuth-token-shaped field before an `account` row is
// written — GitHub's sign-in token is not persisted at all. This isn't only
// the first-sign-up path (`create`): a *returning* sign-in calls
// `internalAdapter.updateAccount` with fresh tokens whenever
// `account.updateAccountOnSignIn` is enabled (Better Auth's own default) —
// stripping only on `create` leaks the raw token on every second-and-later
// sign-in. `updateAccountOnSignIn: false` below is the primary fix (the
// update call never happens, since we never sync tokens we don't keep
// anyway); this hook is defense-in-depth for `update` too, and for
// `linkAccount` (also routed through `create`).
async function stripOAuthTokenFields<T extends Record<string, unknown>>(account: T) {
  return {
    data: {
      ...account,
      accessToken: undefined,
      refreshToken: undefined,
      idToken: undefined,
      accessTokenExpiresAt: undefined,
      refreshTokenExpiresAt: undefined,
    },
  };
}

/**
 * Extracted so tests (T019/T020) can construct an equivalent `betterAuth()`
 * instance against a swapped-in adapter (Better Auth's in-memory adapter —
 * no live Postgres exists to test against here) without duplicating this
 * config and risking it drifting from what actually ships.
 */
export function buildAuthOptions({ database }: { database: ReturnType<typeof drizzleAdapter> }) {
  return {
    database,
    socialProviders: {
      // FR-001: GitHub OAuth is the only sign-in method — no other provider is configured.
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      },
    },
    account: {
      // See stripOAuthTokenFields above — we never sync a token we don't persist.
      updateAccountOnSignIn: false,
    },
    databaseHooks: {
      account: {
        create: { before: stripOAuthTokenFields },
        update: { before: stripOAuthTokenFields },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // NFR-001: 30 days.
      updateAge: 60 * 60 * 24, // NFR-001: sliding refresh, at most once per 24h (Better Auth's own default — set explicitly for traceability to the requirement).
    },
    // SEC-010: explicit, not left at a library default. Set via TRUSTED_ORIGINS
    // (comma-separated) once T004's fixed staging/production domains exist —
    // empty until then, which fails closed rather than trusting nothing/everything.
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    // UX-003: explicit, not left at a library default (same spirit as SEC-010) — every
    // callback failure redirects to the sign-in page's own `?error=` handling
    // (src/app/sign-in/page.tsx), which selects copy from a closed set rather than
    // rendering this raw code.
    onAPIError: {
      errorURL: "/sign-in",
    },
    plugins: [nextCookies()],
  };
}

export const auth = betterAuth(
  buildAuthOptions({
    database: withHashedSessionToken(
      drizzleAdapter(db, {
        provider: "pg",
        schema,
        // FR-014: first-sign-in User+Account creation needs a real DB transaction —
        // Better Auth's own adapter default is `false` (sequential, non-transactional).
        // Better Auth's own OAuth sign-up flow (oauth2/link-account.mjs) already wraps
        // User+Account creation in `runWithTransaction` — this flag is what makes that
        // a real transaction instead of a no-op; no extra hook needed for FR-014 itself.
        transaction: true,
      }),
    ),
  }),
);

/**
 * FR-015: server-only session-resolution primitive. A future tRPC procedure's
 * context/middleware (a separate, later feature) calls this to populate
 * `callerId` before any `src/lib/repositories/**` method runs — this feature
 * does not build that middleware itself (contracts/auth-routes.md).
 *
 * Takes `headers` explicitly rather than calling `next/headers()` internally
 * so it's callable from both a Next.js request context and a plain unit test
 * (T016) without mocking Next's module system.
 */
export async function getCallerId(headers: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers });
    return session?.user.id ?? null;
  } catch {
    // SEC-006: any infrastructure error resolving the caller is treated as
    // denied for this request only — never authenticated, and this does not
    // touch the Session row/cookie.
    return null;
  }
}

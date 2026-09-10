import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { hashSessionToken } from "@/lib/crypto";

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

export function buildAuthOptions({ database }: { database: ReturnType<typeof drizzleAdapter> }) {
  return {
    database,
    socialProviders: {

      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      },
    },
    account: {

      updateAccountOnSignIn: false,
    },
    databaseHooks: {
      account: {
        create: { before: stripOAuthTokenFields },
        update: { before: stripOAuthTokenFields },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },

    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),

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

        transaction: true,
      }),
    ),
  }),
);

export async function getCallerId(headers: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers });
    return session?.user.id ?? null;
  } catch {

    return null;
  }
}

// The shell's sidebar/topbar need the signed-in user's real name (GitHub OAuth already
// populates user.name/email on first sign-in) — getCallerId alone discards it.
export async function getCallerUser(headers: Headers): Promise<{ id: string; name: string; email: string } | null> {
  try {
    const session = await auth.api.getSession({ headers });
    return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  } catch {
    return null;
  }
}

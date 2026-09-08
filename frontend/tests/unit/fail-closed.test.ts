import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db };
});

process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.GITHUB_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");

const SEEDED_SESSION = {
  id: "session-1",
  userId: "user-1",
  token: "raw-token-value",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ipAddress: "",
  userAgent: "",
};

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  await db.delete(schema.githubConnection);
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.user);
  await db.insert(schema.user).values({ id: "user-1", name: "A", email: "a@example.com" });
  await db.insert(schema.session).values(SEEDED_SESSION);
  vi.restoreAllMocks();
});

async function readSeededSession() {
  const { eq } = await import("drizzle-orm");
  return db.query.session.findFirst({ where: eq(schema.session.id, "session-1") });
}

describe("SC-006 fail-closed — caller resolution (getCallerId)", () => {
  it("a DB error while resolving the session denies the request (null) without touching the Session row", async () => {
    const { auth, getCallerId } = await import("@/lib/auth");
    const getSessionSpy = vi.spyOn(auth.api, "getSession").mockRejectedValueOnce(new Error("connection reset"));

    const revokeSpy = vi.spyOn(auth.api, "revokeSession");

    const result = await getCallerId(new Headers());

    expect(result).toBeNull();
    expect(getSessionSpy).toHaveBeenCalledOnce();
    expect(revokeSpy).not.toHaveBeenCalled();

    const sessionAfter = await readSeededSession();
    expect(sessionAfter).toEqual(SEEDED_SESSION);
  });
});

describe("SC-006 fail-closed — scoped query (getGithubConnectionForCallerSafely)", () => {
  it("a DB error during the scoped query denies the request (status: error) without touching the Session row", async () => {
    vi.doMock("@/lib/auth", () => ({ getCallerId: async () => "user-1" }));
    vi.resetModules();
    const { getGithubConnectionForCallerSafely } = await import("@/lib/github-connection-service");
    const { db: mockedDb } = await import("@/db/client");
    vi.spyOn(mockedDb.query.githubConnection, "findFirst").mockRejectedValueOnce(new Error("connection reset"));

    const result = await getGithubConnectionForCallerSafely(new Headers());

    expect(result).toEqual({ status: "error" });

    const sessionAfter = await readSeededSession();
    expect(sessionAfter).toEqual(SEEDED_SESSION);

    vi.doUnmock("@/lib/auth");
  });
});

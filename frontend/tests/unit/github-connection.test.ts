import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Needed by src/lib/crypto.ts (via upsertGithubConnectionForCaller's encrypt() call,
// 007-github-connection) — same convention tests/unit/test-scenario.test.ts uses.
process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

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

const getCallerIdMock = vi.fn<(headers: Headers) => Promise<string | null>>();
vi.mock("@/lib/auth", () => ({ getCallerId: (headers: Headers) => getCallerIdMock(headers) }));

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");
let getGithubConnectionForCaller: typeof import("@/lib/repositories/github-connection").getGithubConnectionForCaller;
let upsertGithubConnectionForCaller: typeof import("@/lib/repositories/github-connection").upsertGithubConnectionForCaller;
let deleteGithubConnectionForCaller: typeof import("@/lib/repositories/github-connection").deleteGithubConnectionForCaller;
let resolveGithubTokenForCaller: typeof import("@/lib/repositories/github-connection").resolveGithubTokenForCaller;
let getGithubConnectionForCallerSafely: typeof import("@/lib/github-connection-service").getGithubConnectionForCallerSafely;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ getGithubConnectionForCaller, upsertGithubConnectionForCaller, deleteGithubConnectionForCaller, resolveGithubTokenForCaller } =
    await import("@/lib/repositories/github-connection"));
  ({ getGithubConnectionForCallerSafely } = await import("@/lib/github-connection-service"));
  getCallerIdMock.mockReset();

  await db.delete(schema.githubConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@example.com" },
    { id: "user-b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(schema.githubConnection).values({
    id: "gc-a",
    userId: "user-a",
    patReference: "enc:fake",
    scopes: "repo",
  });
});

describe("getGithubConnectionForCaller — FR-006/FR-009/FR-012/FR-013 worked example", () => {
  it("returns the caller's own row", async () => {
    const result = await getGithubConnectionForCaller("user-a");
    expect(result?.id).toBe("gc-a");
  });

  it("returns null for a caller with no connection — same shape as 'exists but not theirs' below", async () => {
    const result = await getGithubConnectionForCaller("user-b");
    expect(result).toBeNull();
  });

  it("returns null for a nonexistent callerId, identically to the two cases above (FR-009)", async () => {
    const result = await getGithubConnectionForCaller("no-such-user");
    expect(result).toBeNull();
  });

  it("a raw duplicate-userId insert throws a Postgres unique-violation (FR-012) — verifies the DB constraint T007/T009 shipped, not a translated result (no insert method exists in this feature; see data-model.md's Constraint behavior note)", async () => {
    await expect(
      db.insert(schema.githubConnection).values({
        id: "gc-a-2",
        userId: "user-a",
        patReference: "enc:another",
        scopes: "repo",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("getGithubConnectionForCallerSafely — SEC-007 audit logging (T028, quickstart Scenario 7)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("a denied call (no connection for this caller) produces exactly one not_found_or_not_owned entry, allowlisted fields only", async () => {
    getCallerIdMock.mockResolvedValue("user-b");
    const outcome = await getGithubConnectionForCallerSafely(new Headers());

    expect(outcome).toEqual({ status: "denied" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const { audit } = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(audit).toMatchObject({ type: "scoped_query", resourceType: "GithubConnection", outcome: "not_found_or_not_owned", userId: "user-b" });
    expect(Object.keys(audit).sort()).toEqual(["outcome", "resourceType", "timestamp", "type", "userId"]);
  });

  it("a successful call (owner) logs nothing — only denials/misses are audited", async () => {
    getCallerIdMock.mockResolvedValue("user-a");
    const outcome = await getGithubConnectionForCallerSafely(new Headers());

    expect(outcome).toEqual({ status: "ok", data: expect.objectContaining({ id: "gc-a" }) });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("no session (FR-005) is denied before any scoped query runs, and is not logged as a scoped-query event", async () => {
    getCallerIdMock.mockResolvedValue(null);
    const outcome = await getGithubConnectionForCallerSafely(new Headers());

    expect(outcome).toEqual({ status: "unauthenticated" });
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("upsertGithubConnectionForCaller — 007-github-connection (FR-001/FR-003/FR-004)", () => {
  it("a caller with no existing connection gets a new one", async () => {
    const result = await upsertGithubConnectionForCaller("user-b", { pat: "ghp_fresh_token", scopes: "contents:read,issues:write" });
    expect(result.userId).toBe("user-b");

    const rows = await db.query.githubConnection.findMany({ where: (t, { eq: eqOp }) => eqOp(t.userId, "user-b") });
    expect(rows).toHaveLength(1);
  });

  it("the stored patReference is encrypted, never the plaintext token", async () => {
    const result = await upsertGithubConnectionForCaller("user-b", { pat: "ghp_super_secret_token", scopes: "contents:read,issues:write" });
    expect(result.patReference).not.toContain("ghp_super_secret_token");
  });

  it("reconnecting a caller who already has a connection replaces it — still exactly one row", async () => {
    const before = await upsertGithubConnectionForCaller("user-a", { pat: "ghp_new_token", scopes: "contents:read,issues:write" });

    const rows = await db.query.githubConnection.findMany({ where: (t, { eq: eqOp }) => eqOp(t.userId, "user-a") });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.patReference).toBe(before.patReference);
    expect(rows[0]!.patReference).not.toBe("enc:fake"); // the seeded beforeEach value — genuinely replaced
  });
});

describe("deleteGithubConnectionForCaller — 007-github-connection (FR-007/FR-008)", () => {
  it("deletes an existing connection", async () => {
    await deleteGithubConnectionForCaller("user-a");
    expect(await getGithubConnectionForCaller("user-a")).toBeNull();
  });

  it("deleting a nonexistent connection doesn't throw — a no-op, not an error", async () => {
    await expect(deleteGithubConnectionForCaller("user-b")).resolves.toBeUndefined();
  });

  it("a caller can only delete their own connection — another user's survives untouched", async () => {
    await deleteGithubConnectionForCaller("user-b"); // user-b has no connection at all
    expect(await getGithubConnectionForCaller("user-a")).not.toBeNull(); // user-a's untouched
  });
});

describe("resolveGithubTokenForCaller — 009-wire-github-connection", () => {
  it("decrypts and returns the caller's own connected token", async () => {
    await upsertGithubConnectionForCaller("user-b", { pat: "ghp_real_token_for_resolve_test", scopes: "contents:read,issues:write" });
    expect(await resolveGithubTokenForCaller("user-b")).toBe("ghp_real_token_for_resolve_test");
  });

  it("returns undefined for a caller with no connection — not an error", async () => {
    expect(await resolveGithubTokenForCaller("user-b")).toBeUndefined();
  });

  it("never resolves another caller's token — ownership-scoped", async () => {
    await upsertGithubConnectionForCaller("user-a", { pat: "ghp_user_a_only", scopes: "contents:read,issues:write" });
    expect(await resolveGithubTokenForCaller("user-b")).toBeUndefined();
  });
});

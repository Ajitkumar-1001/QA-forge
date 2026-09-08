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

const getCallerIdMock = vi.fn<(headers: Headers) => Promise<string | null>>();
vi.mock("@/lib/auth", () => ({ getCallerId: (headers: Headers) => getCallerIdMock(headers) }));

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");
let getGithubConnectionForCaller: typeof import("@/lib/repositories/github-connection").getGithubConnectionForCaller;
let getGithubConnectionForCallerSafely: typeof import("@/lib/github-connection-service").getGithubConnectionForCallerSafely;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ getGithubConnectionForCaller } = await import("@/lib/repositories/github-connection"));
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

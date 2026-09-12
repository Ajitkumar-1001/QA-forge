import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Needed by src/lib/crypto.ts (via upsertLinearConnectionForCaller's encrypt() call) — same
// convention tests/unit/github-connection.test.ts uses.
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

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");
let getLinearConnectionForCaller: typeof import("@/lib/repositories/linear-connection").getLinearConnectionForCaller;
let upsertLinearConnectionForCaller: typeof import("@/lib/repositories/linear-connection").upsertLinearConnectionForCaller;
let deleteLinearConnectionForCaller: typeof import("@/lib/repositories/linear-connection").deleteLinearConnectionForCaller;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ getLinearConnectionForCaller, upsertLinearConnectionForCaller, deleteLinearConnectionForCaller } = await import(
    "@/lib/repositories/linear-connection"
  ));

  await db.delete(schema.linearConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@example.com" },
    { id: "user-b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(schema.linearConnection).values({
    id: "lc-a",
    userId: "user-a",
    apiKeyReference: "enc:fake",
    teamId: "team-1",
    teamName: "Engineering",
  });
});

describe("getLinearConnectionForCaller", () => {
  it("returns the caller's own row", async () => {
    const result = await getLinearConnectionForCaller("user-a");
    expect(result?.id).toBe("lc-a");
    expect(result?.teamName).toBe("Engineering");
  });

  it("returns null for a caller with no connection", async () => {
    expect(await getLinearConnectionForCaller("user-b")).toBeNull();
  });
});

describe("upsertLinearConnectionForCaller — FR-002/FR-004/FR-014", () => {
  it("a caller with no existing connection gets a new one", async () => {
    const result = await upsertLinearConnectionForCaller("user-b", { apiKey: "lin_fresh", teamId: "team-2", teamName: "Design" });
    expect(result.userId).toBe("user-b");
    expect(result.teamId).toBe("team-2");

    const rows = await db.query.linearConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-b") });
    expect(rows).toHaveLength(1);
  });

  it("the stored apiKeyReference is encrypted, never the plaintext key", async () => {
    const result = await upsertLinearConnectionForCaller("user-b", { apiKey: "lin_super_secret_key", teamId: "team-2", teamName: "Design" });
    expect(result.apiKeyReference).not.toContain("lin_super_secret_key");
  });

  it("reconnecting a caller who already has a connection replaces it — still exactly one row, team can change", async () => {
    const before = await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_new", teamId: "team-3", teamName: "Support" });

    const rows = await db.query.linearConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-a") });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe("team-3");
    expect(rows[0]!.apiKeyReference).toBe(before.apiKeyReference);
    expect(rows[0]!.apiKeyReference).not.toBe("enc:fake");
  });

  it("two concurrent upserts for the same caller (the two-step connect flow's real race, research.md Decision 7) resolve via onConflictDoUpdate — never a duplicate-key error", async () => {
    const results = await Promise.all([
      upsertLinearConnectionForCaller("user-b", { apiKey: "lin_first", teamId: "team-2", teamName: "Design" }),
      upsertLinearConnectionForCaller("user-b", { apiKey: "lin_second", teamId: "team-4", teamName: "Sales" }),
    ]);
    expect(results).toHaveLength(2);

    const rows = await db.query.linearConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-b") });
    expect(rows).toHaveLength(1); // last write wins cleanly, no duplicate row
  });
});

describe("deleteLinearConnectionForCaller — FR-006", () => {
  it("deletes an existing connection", async () => {
    await deleteLinearConnectionForCaller("user-a");
    expect(await getLinearConnectionForCaller("user-a")).toBeNull();
  });

  it("deleting a nonexistent connection doesn't throw — a no-op, not an error", async () => {
    await expect(deleteLinearConnectionForCaller("user-b")).resolves.toBeUndefined();
  });

  it("a caller can only delete their own connection — another user's survives untouched", async () => {
    await deleteLinearConnectionForCaller("user-b");
    expect(await getLinearConnectionForCaller("user-a")).not.toBeNull();
  });
});

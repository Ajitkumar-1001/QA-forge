import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Needed by src/lib/crypto.ts (via upsertSlackConnectionForCaller's encrypt() call) — same
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
let getSlackConnectionForCaller: typeof import("@/lib/repositories/slack-connection").getSlackConnectionForCaller;
let upsertSlackConnectionForCaller: typeof import("@/lib/repositories/slack-connection").upsertSlackConnectionForCaller;
let deleteSlackConnectionForCaller: typeof import("@/lib/repositories/slack-connection").deleteSlackConnectionForCaller;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ getSlackConnectionForCaller, upsertSlackConnectionForCaller, deleteSlackConnectionForCaller } = await import(
    "@/lib/repositories/slack-connection"
  ));

  await db.delete(schema.slackConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@example.com" },
    { id: "user-b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(schema.slackConnection).values({
    id: "sc-a",
    userId: "user-a",
    webhookUrlReference: "enc:fake",
  });
});

describe("getSlackConnectionForCaller", () => {
  it("returns the caller's own row", async () => {
    const result = await getSlackConnectionForCaller("user-a");
    expect(result?.id).toBe("sc-a");
  });

  it("returns null for a caller with no connection", async () => {
    expect(await getSlackConnectionForCaller("user-b")).toBeNull();
  });

  it("returns null for a nonexistent callerId, identically to 'exists but not theirs'", async () => {
    expect(await getSlackConnectionForCaller("no-such-user")).toBeNull();
  });
});

describe("upsertSlackConnectionForCaller — FR-001/FR-003/FR-014", () => {
  it("a caller with no existing connection gets a new one", async () => {
    const result = await upsertSlackConnectionForCaller("user-b", { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" });
    expect(result.userId).toBe("user-b");

    const rows = await db.query.slackConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-b") });
    expect(rows).toHaveLength(1);
  });

  it("the stored webhookUrlReference is encrypted, never the plaintext URL", async () => {
    const result = await upsertSlackConnectionForCaller("user-b", { webhookUrl: "https://hooks.slack.com/services/T00/B00/secret" });
    expect(result.webhookUrlReference).not.toContain("https://hooks.slack.com/services/T00/B00/secret");
  });

  it("reconnecting a caller who already has a connection replaces it — still exactly one row", async () => {
    const before = await upsertSlackConnectionForCaller("user-a", { webhookUrl: "https://hooks.slack.com/services/T00/B00/new" });

    const rows = await db.query.slackConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-a") });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.webhookUrlReference).toBe(before.webhookUrlReference);
    expect(rows[0]!.webhookUrlReference).not.toBe("enc:fake"); // the seeded beforeEach value — genuinely replaced
  });

  it("two concurrent upserts for the same caller resolve via onConflictDoUpdate — never a duplicate-key error", async () => {
    const results = await Promise.all([
      upsertSlackConnectionForCaller("user-b", { webhookUrl: "https://hooks.slack.com/services/T00/B00/first" }),
      upsertSlackConnectionForCaller("user-b", { webhookUrl: "https://hooks.slack.com/services/T00/B00/second" }),
    ]);
    expect(results).toHaveLength(2); // neither call rejected

    const rows = await db.query.slackConnection.findMany({ where: (t, { eq }) => eq(t.userId, "user-b") });
    expect(rows).toHaveLength(1); // last write wins cleanly, no duplicate row
  });
});

describe("deleteSlackConnectionForCaller — FR-005", () => {
  it("deletes an existing connection", async () => {
    await deleteSlackConnectionForCaller("user-a");
    expect(await getSlackConnectionForCaller("user-a")).toBeNull();
  });

  it("deleting a nonexistent connection doesn't throw — a no-op, not an error", async () => {
    await expect(deleteSlackConnectionForCaller("user-b")).resolves.toBeUndefined();
  });

  it("a caller can only delete their own connection — another user's survives untouched", async () => {
    await deleteSlackConnectionForCaller("user-b"); // user-b has no connection at all
    expect(await getSlackConnectionForCaller("user-a")).not.toBeNull(); // user-a's untouched
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestScenario } from "@/db/schema";

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
let createScenarioForCaller: typeof import("@/lib/repositories/test-scenario").createScenarioForCaller;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ createScenarioForCaller } = await import("@/lib/repositories/test-scenario"));

  await db.delete(schema.testScenario);
  await db.delete(schema.project);
  await db.delete(schema.githubConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@example.com" },
    { id: "user-b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(schema.project).values({
    id: "project-a",
    userId: "user-a",
    applicationUrl: "https://example.com",
    repository: "owner/repo",
  });
});

describe("createScenarioForCaller — FR-005/FR-006/FR-011 ownership-fixture (SEC-009)", () => {
  it("owner creates a scenario under their own project", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "log in and check the dashboard renders",
      credentialsReference: null,
    });

    expect(result).not.toHaveProperty("ok", false);
    const scenario = result as TestScenario;
    expect(scenario.projectId).toBe("project-a");
    expect(scenario.objective).toBe("log in and check the dashboard renders");
    expect(scenario.credentialsReference).toBeNull();

    const rows = await db.query.testScenario.findMany({ where: (t, { eq }) => eq(t.projectId, "project-a") });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(scenario.id);
  });

  it("a caller passing another user's projectId is denied — not_found_or_not_owned (FR-005/FR-006)", async () => {
    const result = await createScenarioForCaller("user-b", {
      projectId: "project-a",
      objective: "attempt under someone else's project",
      credentialsReference: null,
    });

    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });

    const rows = await db.query.testScenario.findMany({ where: (t, { eq }) => eq(t.projectId, "project-a") });
    expect(rows).toHaveLength(0);
  });

  it("a nonexistent projectId is denied identically to an unowned one (FR-006)", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "no-such-project",
      objective: "attempt against a project that doesn't exist",
      credentialsReference: null,
    });

    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("credentialsReference is stored as an opaque pointer, never the plaintext credential (FR-011)", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "sign in with a credential",
      credentialsReference: "secretsmanager://qaforge/scenario-credential/abc123",
    });

    const scenario = result as TestScenario;
    expect(scenario.credentialsReference).toBe("secretsmanager://qaforge/scenario-credential/abc123");
    expect(scenario.credentialsReference).not.toMatch(/password|hunter2/i);
  });
});

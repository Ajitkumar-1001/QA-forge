import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestScenario } from "@/db/schema";

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
let createScenarioForCaller: typeof import("@/lib/repositories/test-scenario").createScenarioForCaller;
let resolveCredentialForCaller: typeof import("@/lib/repositories/test-scenario").resolveCredentialForCaller;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ createScenarioForCaller, resolveCredentialForCaller } = await import("@/lib/repositories/test-scenario"));

  await db.delete(schema.credential);
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

describe("createScenarioForCaller — credentialValue path + resolveCredentialForCaller (005-run-launch-ui, FR-005/FR-006/FR-007)", () => {
  it("stores an encrypted value, never the plaintext, and sets a real resolvable credentials_reference", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "log in with a submitted credential",
      credentialsReference: null,
      credentialValue: "hunter2",
    });

    const scenario = result as TestScenario;
    expect(scenario.credentialsReference).not.toBeNull();
    expect(scenario.credentialsReference).not.toBe("hunter2");

    const credentialRow = await db.query.credential.findFirst({
      where: (t, { eq }) => eq(t.id, scenario.credentialsReference!),
    });
    expect(credentialRow).toBeDefined();
    expect(credentialRow!.encryptedValue).not.toContain("hunter2");
    expect(credentialRow!.testScenarioId).toBe(scenario.id);
  });

  it("resolveCredentialForCaller round-trips the plaintext for the owning caller", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "log in with a submitted credential",
      credentialsReference: null,
      credentialValue: "hunter2",
    });
    const scenario = result as TestScenario;

    expect(await resolveCredentialForCaller("user-a", scenario.id)).toBe("hunter2");
  });

  it("resolveCredentialForCaller returns null for a scenario with no credential", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "no credential needed",
      credentialsReference: null,
    });
    const scenario = result as TestScenario;

    expect(await resolveCredentialForCaller("user-a", scenario.id)).toBeNull();
  });

  it("resolveCredentialForCaller denies a non-owning caller — identical to no credential existing", async () => {
    const result = await createScenarioForCaller("user-a", {
      projectId: "project-a",
      objective: "log in with a submitted credential",
      credentialsReference: null,
      credentialValue: "hunter2",
    });
    const scenario = result as TestScenario;

    expect(await resolveCredentialForCaller("user-b", scenario.id)).toBeNull();
  });

  it("a failed scenario creation (unowned project) leaves no orphaned credential row", async () => {
    await createScenarioForCaller("user-b", {
      projectId: "project-a",
      objective: "attempt under someone else's project",
      credentialsReference: null,
      credentialValue: "hunter2",
    });

    const rows = await db.query.credential.findMany();
    expect(rows).toHaveLength(0);
  });
});

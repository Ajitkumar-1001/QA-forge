import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "@/mastra/types";

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
let createProjectForCaller: typeof import("@/lib/repositories/project").createProjectForCaller;
let deleteProjectForCaller: typeof import("@/lib/repositories/project").deleteProjectForCaller;
let createScenarioForCaller: typeof import("@/lib/repositories/test-scenario").createScenarioForCaller;
let startRunForCaller: typeof import("@/lib/repositories/test-run").startRunForCaller;
let recordRunResultForCaller: typeof import("@/lib/repositories/test-run").recordRunResultForCaller;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ createProjectForCaller, deleteProjectForCaller } = await import("@/lib/repositories/project"));
  ({ createScenarioForCaller } = await import("@/lib/repositories/test-scenario"));
  ({ startRunForCaller, recordRunResultForCaller } = await import("@/lib/repositories/test-run"));

  await db.delete(schema.reportHypothesis);
  await db.delete(schema.report);
  await db.delete(schema.hypothesisEvidence);
  await db.delete(schema.hypothesis);
  await db.delete(schema.evidence);
  await db.delete(schema.testStep);
  await db.delete(schema.testRun);
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
});

describe("createProjectForCaller / deleteProjectForCaller — FR-004/FR-005/FR-006 ownership-fixture (SEC-009)", () => {
  it("creates a project owned by the caller", async () => {
    const created = await createProjectForCaller("user-a", {
      applicationUrl: "https://example.com",
      repository: "owner/repo",
    });
    expect(created.userId).toBe("user-a");

    const row = await db.query.project.findFirst({ where: (t, { eq }) => eq(t.id, created.id) });
    expect(row?.userId).toBe("user-a");
  });

  it("owner deletes their own project", async () => {
    const created = await createProjectForCaller("user-a", {
      applicationUrl: "https://example.com",
      repository: "owner/repo",
    });
    expect(await deleteProjectForCaller("user-a", created.id)).toEqual({ ok: true });

    const row = await db.query.project.findFirst({ where: (t, { eq }) => eq(t.id, created.id) });
    expect(row).toBeUndefined();
  });

  it("a non-owning caller cannot delete another user's project — not_found_or_not_owned", async () => {
    const created = await createProjectForCaller("user-a", {
      applicationUrl: "https://example.com",
      repository: "owner/repo",
    });

    expect(await deleteProjectForCaller("user-b", created.id)).toEqual({ ok: false, reason: "not_found_or_not_owned" });

    const row = await db.query.project.findFirst({ where: (t, { eq }) => eq(t.id, created.id) });
    expect(row).toBeDefined(); // untouched
  });

  it("a nonexistent projectId is denied identically to an unowned one", async () => {
    expect(await deleteProjectForCaller("user-a", "no-such-project")).toEqual({
      ok: false,
      reason: "not_found_or_not_owned",
    });
  });
});

describe("deleteProjectForCaller — FR-009/SC-004 cascade-delete", () => {
  it("removes every row across all 9 tables scoped under the deleted project, in one operation", async () => {
    const project = await createProjectForCaller("user-a", {
      applicationUrl: "https://example.com",
      repository: "owner/repo",
    });
    const scenario = await createScenarioForCaller("user-a", {
      projectId: project.id,
      objective: "log in and reach the dashboard",
      credentialsReference: null,
    });
    if ("ok" in scenario) throw new Error("unexpected denial building fixture");

    const started = await startRunForCaller("user-a", { scenarioId: scenario.id, idempotencyKey: "cascade-key" });
    if ("ok" in started) throw new Error("unexpected denial building fixture");

    const report: Report = {
      result: "FAIL",
      steps: [
        {
          position: 0,
          action: "Submit credentials",
          expectedOutcome: "Redirected to dashboard",
          successCriteria: { kind: "url", match: "/dashboard" },
          failureCriteria: { kind: "selectorPresent", selector: ".error-banner" },
          observed: "ELEMENT_NOT_FOUND",
          status: "FAILED",
        },
      ],
      evidence: [{ id: "ev-1", stepId: "0", type: "CONSOLE", content: "login failed", metadata: {} }],
      hypotheses: [
        {
          id: "hyp-1",
          status: "SUPPORTED",
          description: "The login handler rejects valid credentials",
          confidence: 0.9,
          evidenceLinks: [{ evidenceRef: "ev-1", role: "SUPPORTING" }],
          checks: [],
        },
      ],
      winningHypothesisId: "hyp-1",
      confidence: 0.9,
    };
    const recorded = await recordRunResultForCaller("user-a", started.run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report,
    });
    expect(recorded).toEqual({ ok: true, alreadyRecorded: false });

    // Every one of the 9 tables has at least one row before delete — otherwise this test
    // would pass trivially by finding nothing to begin with.
    const before = {
      project: await db.query.project.findMany(),
      testScenario: await db.query.testScenario.findMany(),
      testRun: await db.query.testRun.findMany(),
      testStep: await db.query.testStep.findMany(),
      evidence: await db.query.evidence.findMany(),
      hypothesis: await db.query.hypothesis.findMany(),
      hypothesisEvidence: await db.query.hypothesisEvidence.findMany(),
      report: await db.query.report.findMany(),
      reportHypothesis: await db.query.reportHypothesis.findMany(),
    };
    for (const [table, rows] of Object.entries(before)) {
      expect(rows.length, `expected fixture rows in ${table}`).toBeGreaterThan(0);
    }

    // A second tenant's rows, seeded so the post-delete assertions below can't pass
    // trivially — an unscoped "wipe every row in every table" bug would clear these too.
    const projectB = await createProjectForCaller("user-b", {
      applicationUrl: "https://b.example.com",
      repository: "b/repo",
    });
    const scenarioB = await createScenarioForCaller("user-b", {
      projectId: projectB.id,
      objective: "b's own objective",
      credentialsReference: null,
    });
    if ("ok" in scenarioB) throw new Error("unexpected denial building user-b fixture");
    const startedB = await startRunForCaller("user-b", { scenarioId: scenarioB.id, idempotencyKey: "b-key" });
    if ("ok" in startedB) throw new Error("unexpected denial building user-b fixture");

    expect(await deleteProjectForCaller("user-a", project.id)).toEqual({ ok: true });

    // project/testScenario/testRun legitimately keep one row each now — user-b's (checked
    // below, proving the delete is scoped and not a global wipe). The other 6 tables have
    // no user-b rows (no recordRunResultForCaller for user-b), so they must be fully empty.
    const after = {
      testStep: await db.query.testStep.findMany(),
      evidence: await db.query.evidence.findMany(),
      hypothesis: await db.query.hypothesis.findMany(),
      hypothesisEvidence: await db.query.hypothesisEvidence.findMany(),
      report: await db.query.report.findMany(),
      reportHypothesis: await db.query.reportHypothesis.findMany(),
    };
    for (const [table, rows] of Object.entries(after)) {
      expect(rows, `expected zero rows in ${table} after cascade-delete`).toHaveLength(0);
    }

    expect(await db.query.project.findMany()).toEqual([expect.objectContaining({ id: projectB.id })]);
    expect(await db.query.testScenario.findMany()).toEqual([expect.objectContaining({ id: scenarioB.id })]);
    expect(await db.query.testRun.findMany()).toEqual([expect.objectContaining({ id: startedB.run.id })]);
  });
});

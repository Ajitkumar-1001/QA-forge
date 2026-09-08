import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestRun } from "@/db/schema";
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
let startRunForCaller: typeof import("@/lib/repositories/test-run").startRunForCaller;
let recordRunResultForCaller: typeof import("@/lib/repositories/test-run").recordRunResultForCaller;
let getRunForCaller: typeof import("@/lib/repositories/test-run").getRunForCaller;

let scenarioId: string;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ startRunForCaller, recordRunResultForCaller, getRunForCaller } = await import("@/lib/repositories/test-run"));

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
  await db.insert(schema.project).values({
    id: "project-a",
    userId: "user-a",
    applicationUrl: "https://example.com",
    repository: "owner/repo",
  });
  const [scenario] = await db
    .insert(schema.testScenario)
    .values({ id: "scenario-a", projectId: "project-a", objective: "log in" })
    .returning();
  scenarioId = scenario!.id;
});

describe("startRunForCaller / recordRunResultForCaller / getRunForCaller — FR-005/FR-006 ownership-fixture (SEC-009)", () => {
  it("owner starts a run against their own scenario", async () => {
    const result = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-1" });
    expect(result).not.toHaveProperty("ok", false);
    const started = result as { run: TestRun; created: boolean };
    expect(started.created).toBe(true);
    expect(started.run.scenarioId).toBe(scenarioId);
    expect(started.run.status).toBe("PLANNING");
  });

  it("a caller passing another user's scenarioId is denied — not_found_or_not_owned", async () => {
    const result = await startRunForCaller("user-b", { scenarioId, idempotencyKey: "key-1" });
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("a nonexistent scenarioId is denied identically to an unowned one", async () => {
    const result = await startRunForCaller("user-a", { scenarioId: "no-such-scenario", idempotencyKey: "key-1" });
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("recordRunResultForCaller denies a non-owning caller — the run's status is left untouched", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-1" })) as {
      run: TestRun;
    };

    const result = await recordRunResultForCaller("user-b", started.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [],
      report: null,
    });
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });

    const stillPlanning = await db.query.testRun.findFirst({ where: (t, { eq }) => eq(t.id, started.run.id) });
    expect(stillPlanning?.status).toBe("PLANNING");
  });

  it("getRunForCaller denies a non-owning caller identically to a nonexistent run", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-1" })) as {
      run: TestRun;
    };
    expect(await getRunForCaller("user-b", started.run.id)).toBeNull();
    expect(await getRunForCaller("user-b", "no-such-run")).toBeNull();
  });

  it("a dangling evidenceRef is dropped, not fatal — the rest of the report still persists", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-1" })) as {
      run: TestRun;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const report: Report = {
      result: "FAIL",
      steps: [],
      evidence: [{ id: "ev-1", stepId: null, type: "CONSOLE", content: "login failed", metadata: {} }],
      hypotheses: [
        {
          id: "hyp-1",
          status: "SUPPORTED",
          description: "The login handler rejects valid credentials",
          confidence: 0.9,
          // "ev-ghost" has no matching row in `evidence` above — must not roll back the
          // transaction and lose the whole report (the FK would otherwise reject it).
          evidenceLinks: [
            { evidenceRef: "ev-1", role: "SUPPORTING" },
            { evidenceRef: "ev-ghost", role: "SUPPORTING" },
          ],
          checks: [],
        },
      ],
      winningHypothesisId: "hyp-1",
      confidence: 0.9,
    };

    const result = await recordRunResultForCaller("user-a", started.run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report,
    });
    expect(result).toEqual({ ok: true, alreadyRecorded: false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ev-ghost"));

    const links = await db.query.hypothesisEvidence.findMany({
      where: (t, { eq }) => eq(t.hypothesisId, "hyp-1"),
    });
    expect(links).toEqual([expect.objectContaining({ hypothesisId: "hyp-1", evidenceId: "ev-1" })]);

    warnSpy.mockRestore();
  });
});

describe("startRunForCaller — FR-007/FR-008 idempotency under concurrency (SC-003)", () => {
  it("exactly one run is created for two simultaneous requests with the same (scenarioId, idempotencyKey)", async () => {
    const [first, second] = await Promise.all([
      startRunForCaller("user-a", { scenarioId, idempotencyKey: "race-key" }),
      startRunForCaller("user-a", { scenarioId, idempotencyKey: "race-key" }),
    ]);

    expect("ok" in first).toBe(false);
    expect("ok" in second).toBe(false);
    const a = first as { run: TestRun; created: boolean };
    const b = second as { run: TestRun; created: boolean };

    expect(a.run.id).toBe(b.run.id);
    // Exactly one call won the insert; the other resolved to the winner's row.
    expect(a.created).not.toBe(b.created);
    expect(a.created || b.created).toBe(true);

    const rows = await db.query.testRun.findMany({
      where: (t, { and, eq }) => and(eq(t.scenarioId, scenarioId), eq(t.idempotencyKey, "race-key")),
    });
    expect(rows).toHaveLength(1);
  });

  it("reusing an idempotency key under a different scenario is not a collision (Edge Cases)", async () => {
    const [otherScenario] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-b", projectId: "project-a", objective: "a different objective" })
      .returning();

    const first = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "shared-key" })) as {
      run: TestRun;
      created: boolean;
    };
    const second = (await startRunForCaller("user-a", {
      scenarioId: otherScenario!.id,
      idempotencyKey: "shared-key",
    })) as { run: TestRun; created: boolean };

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.run.id).not.toBe(second.run.id);
  });
});

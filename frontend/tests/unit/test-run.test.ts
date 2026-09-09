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
let listRunsForCaller: typeof import("@/lib/repositories/test-run").listRunsForCaller;

let scenarioId: string;

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ startRunForCaller, recordRunResultForCaller, getRunForCaller, listRunsForCaller } = await import(
    "@/lib/repositories/test-run"
  ));

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

  it("a dangling winningHypothesisId is dropped to null, not fatal — same policy as a dangling evidenceRef", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-2" })) as {
      run: TestRun;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const report: Report = {
      result: "FAIL",
      steps: [],
      evidence: [],
      hypotheses: [
        {
          id: "hyp-1",
          status: "REJECTED",
          description: "A hypothesis that was considered but not the (bogus) winner",
          confidence: 0.4,
          evidenceLinks: [],
          checks: [],
        },
      ],
      // "hyp-ghost" matches no hypothesis in this report — a plausible model-output bug,
      // same failure class as a dangling evidenceRef.
      winningHypothesisId: "hyp-ghost",
      confidence: 0.4,
    };

    const result = await recordRunResultForCaller("user-a", started.run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report,
    });
    expect(result).toEqual({ ok: true, alreadyRecorded: false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("hyp-ghost"));

    const full = await getRunForCaller("user-a", started.run.id);
    expect(full!.hypotheses).toHaveLength(1); // the real hypothesis still persists
    expect(full!.report!.winningHypothesisId).toBeNull(); // the bogus pointer does not

    warnSpy.mockRestore();
  });

  it("an evidence stepId that matches no step position resolves to null, with a warning", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-3" })) as {
      run: TestRun;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const report: Report = {
      result: "FAIL",
      steps: [],
      evidence: [{ id: "ev-orphan", stepId: "99", type: "CONSOLE", content: "no step at position 99", metadata: {} }],
      hypotheses: [],
      winningHypothesisId: null,
      confidence: null,
    };

    await recordRunResultForCaller("user-a", started.run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("99"));

    const full = await getRunForCaller("user-a", started.run.id);
    expect(full!.evidence[0]!.stepId).toBeNull();

    warnSpy.mockRestore();
  });

  it("a duplicate (hypothesisId, evidenceId) link keeps the last occurrence's role", async () => {
    const started = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-4" })) as {
      run: TestRun;
    };

    const report: Report = {
      result: "FAIL",
      steps: [],
      evidence: [{ id: "ev-1", stepId: null, type: "CONSOLE", content: "some output", metadata: {} }],
      hypotheses: [
        {
          id: "hyp-1",
          status: "SUPPORTED",
          description: "duplicate-link hypothesis",
          confidence: 0.7,
          evidenceLinks: [
            { evidenceRef: "ev-1", role: "SUPPORTING" },
            { evidenceRef: "ev-1", role: "CONTRADICTING" }, // same pair, different role — last wins
          ],
          checks: [],
        },
      ],
      winningHypothesisId: "hyp-1",
      confidence: 0.7,
    };

    await recordRunResultForCaller("user-a", started.run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report,
    });

    const links = await db.query.hypothesisEvidence.findMany({
      where: (t, { eq }) => eq(t.hypothesisId, "hyp-1"),
    });
    expect(links).toEqual([expect.objectContaining({ hypothesisId: "hyp-1", evidenceId: "ev-1", role: "CONTRADICTING" })]);
  });
});

describe("startRunForCaller — FR-007/FR-008 idempotency under concurrency (SC-003)", () => {
  // PGlite is single user/connection (its own README), so the two Promise.all-issued
  // INSERTs below execute sequentially on one connection — this does not exercise a true
  // concurrent race between overlapping transactions the way two separate Postgres
  // connections would. The atomicity guarantee itself (UNIQUE(scenario_id,
  // idempotency_key) + INSERT...ON CONFLICT DO NOTHING) is correct by construction in real
  // Postgres regardless; what this test actually proves is that the constraint exists and
  // that startRunForCaller's insert-or-return-existing logic converges both calls onto the
  // same row, not that the race itself was empirically closed under concurrency.
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

describe("listRunsForCaller — FR-001/FR-011 ownership-fixture (SEC-009)", () => {
  it("a caller with no projects/runs gets an empty list, not an error", async () => {
    expect(await listRunsForCaller("user-b")).toEqual([]);
  });

  it("returns only the caller's own runs, never another caller's", async () => {
    const startedA = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "a-key" })) as {
      run: TestRun;
    };

    const [projectB] = await db
      .insert(schema.project)
      .values({ id: "project-b", userId: "user-b", applicationUrl: "https://b.example.com", repository: "b/repo" })
      .returning();
    const [scenarioB] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-b-list", projectId: projectB!.id, objective: "b's objective" })
      .returning();
    const startedB = (await startRunForCaller("user-b", {
      scenarioId: scenarioB!.id,
      idempotencyKey: "b-key",
    })) as { run: TestRun };

    const runsForA = await listRunsForCaller("user-a");
    expect(runsForA.map((r) => r.id)).toEqual([startedA.run.id]);
    expect(runsForA[0]).toMatchObject({ objective: "log in", repository: "owner/repo", status: "PLANNING" });

    const runsForB = await listRunsForCaller("user-b");
    expect(runsForB.map((r) => r.id)).toEqual([startedB.run.id]);
  });

  it("orders newest-first by startedAt", async () => {
    const first = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-1" })) as { run: TestRun };
    // Ensure a distinct, later startedAt than the first run.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "key-2" })) as { run: TestRun };

    const runs = await listRunsForCaller("user-a");
    expect(runs.map((r) => r.id)).toEqual([second.run.id, first.run.id]);
  });
});

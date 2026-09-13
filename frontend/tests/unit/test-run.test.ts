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

describe("startRunForCaller — 006-run-concurrency-cap (PRD D14, FR-001/FR-002/FR-004)", () => {
  // Seeds N non-terminal test_run rows directly (not through startRunForCaller) — these
  // tests are about the 6th call's behavior given an existing count, not about how the
  // first N rows themselves were created.
  async function seedRuns(status: (typeof schema.testRunStatusEnum.enumValues)[number], count: number, projectScenarioId = scenarioId) {
    await db.insert(schema.testRun).values(
      Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        scenarioId: projectScenarioId,
        idempotencyKey: `seed-${status}-${i}-${crypto.randomUUID()}`,
        status,
        startedAt: new Date(),
      })),
    );
  }

  it("a 6th non-terminal run is rejected as RATE_LIMITED once 5 already exist", async () => {
    await seedRuns("RUNNING", 5);
    const result = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "the-6th" });
    expect(result).toEqual({ ok: false, reason: "RATE_LIMITED" });

    const rows = await db.query.testRun.findMany({ where: (t, { eq }) => eq(t.idempotencyKey, "the-6th") });
    expect(rows).toHaveLength(0);
  });

  it("a 5th non-terminal run still succeeds when only 4 exist", async () => {
    await seedRuns("PLANNING", 4);
    const result = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "the-5th" });
    expect(result).not.toHaveProperty("ok", false);
    expect((result as { created: boolean }).created).toBe(true);
  });

  it("PASSED/FAILED/ERROR runs never count toward the cap, however many exist", async () => {
    await seedRuns("PASSED", 3);
    await seedRuns("FAILED", 3);
    await seedRuns("ERROR", 3);
    // 9 terminal runs on the books; still 0 non-terminal, so this succeeds same as a
    // brand-new caller would.
    const result = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "after-terminal" });
    expect(result).not.toHaveProperty("ok", false);
    expect((result as { created: boolean }).created).toBe(true);
  });

  it("the cap is shared across a caller's projects, not counted per-project", async () => {
    const [projectA2] = await db
      .insert(schema.project)
      .values({ id: "project-a2", userId: "user-a", applicationUrl: "https://a2.example.com", repository: "owner/repo2" })
      .returning();
    const [scenarioA2] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-a2", projectId: projectA2!.id, objective: "a second project's objective" })
      .returning();

    await seedRuns("RUNNING", 3, scenarioId);
    await seedRuns("INVESTIGATING", 2, scenarioA2!.id);

    // 5 non-terminal runs total for user-a, split 3/2 across two projects — a 6th, against
    // either project's scenario, is still rejected.
    const result = await startRunForCaller("user-a", { scenarioId: scenarioA2!.id, idempotencyKey: "cross-project-6th" });
    expect(result).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });

  it("a non-owning caller at the cap still gets not_found_or_not_owned, never RATE_LIMITED", async () => {
    await seedRuns("RUNNING", 5);
    const result = await startRunForCaller("user-b", { scenarioId, idempotencyKey: "not-mine" });
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("a freed slot is usable immediately once one of the 5 reaches a terminal state (FR-008, quickstart Scenario 3)", async () => {
    await seedRuns("RUNNING", 5);
    const rejected = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "still-at-cap" });
    expect(rejected).toEqual({ ok: false, reason: "RATE_LIMITED" });

    // One of the 5 finishes — no manual reset, just a normal terminal transition.
    const [oneOfFive] = await db.query.testRun.findMany({ where: (t, { eq }) => eq(t.scenarioId, scenarioId), limit: 1 });
    await recordRunResultForCaller("user-a", oneOfFive!.id, { status: "PASSED", errorReason: null, modelCalls: [], report: null });

    const result = await startRunForCaller("user-a", { scenarioId, idempotencyKey: "freed-slot" });
    expect(result).not.toHaveProperty("ok", false);
    expect((result as { created: boolean }).created).toBe(true);
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

describe("getShellCountsForCaller — real replacement for AppShell's mock runs/approvals counts", () => {
  it("counts only this caller's non-terminal runs and PENDING approvals", async () => {
    // Two non-terminal runs and one terminal run for user-a.
    await startRunForCaller("user-a", { scenarioId, idempotencyKey: "live-1" });
    const secondLive = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "live-2" })) as { run: TestRun };
    const terminal = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "terminal-1" })) as { run: TestRun };
    await recordRunResultForCaller("user-a", terminal.run.id, { status: "PASSED", errorReason: null, modelCalls: [], report: null });

    // One PENDING approval on the second live run.
    await db.insert(schema.approval).values({
      id: "approval-1",
      runId: secondLive.run.id,
      status: "PENDING",
      draftTitle: "A drafted issue",
      draftBody: "Body",
    });

    const { getShellCountsForCaller } = await import("@/lib/repositories/test-run");
    expect(await getShellCountsForCaller("user-a")).toEqual({ liveRunCount: 2, pendingApprovalCount: 1 });
  });

  it("never counts another caller's runs or approvals", async () => {
    await startRunForCaller("user-a", { scenarioId, idempotencyKey: "mine" });

    const [projectB] = await db
      .insert(schema.project)
      .values({ id: "project-b-counts", userId: "user-b", applicationUrl: "https://b.example.com", repository: "b/repo" })
      .returning();
    const [scenarioB] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-b-counts", projectId: projectB!.id, objective: "b's objective" })
      .returning();
    await startRunForCaller("user-b", { scenarioId: scenarioB!.id, idempotencyKey: "not-mine" });

    const { getShellCountsForCaller } = await import("@/lib/repositories/test-run");
    expect(await getShellCountsForCaller("user-a")).toEqual({ liveRunCount: 1, pendingApprovalCount: 0 });
  });

  it("a caller with no runs at all gets zero counts, not an error", async () => {
    const { getShellCountsForCaller } = await import("@/lib/repositories/test-run");
    expect(await getShellCountsForCaller("user-b")).toEqual({ liveRunCount: 0, pendingApprovalCount: 0 });
  });
});

describe("listAgentActivityForCaller — cross-run modelCalls flatten, ownership-fixture (SEC-009)", () => {
  it("a caller with no runs gets an empty feed, not an error", async () => {
    const { listAgentActivityForCaller } = await import("@/lib/repositories/test-run");
    expect(await listAgentActivityForCaller("user-b")).toEqual([]);
  });

  it("flattens modelCalls across runs, newest run first", async () => {
    const { listAgentActivityForCaller, recordRunResultForCaller } = await import("@/lib/repositories/test-run");
    const first = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "activity-1" })) as { run: TestRun };
    await recordRunResultForCaller("user-a", first.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [{ role: "planner", modelId: "model-1", responseId: "resp-1" }],
      report: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "activity-2" })) as { run: TestRun };
    await recordRunResultForCaller("user-a", second.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [
        { role: "planner", modelId: "model-1", responseId: "resp-2" },
        { role: "validator", modelId: "model-2", responseId: "resp-3" },
      ],
      report: null,
    });

    const entries = await listAgentActivityForCaller("user-a");
    expect(entries.map((e) => e.responseId)).toEqual(["resp-2", "resp-3", "resp-1"]);
    expect(entries[0]).toMatchObject({ runId: second.run.id, objective: "log in", role: "planner", modelId: "model-1" });
  });

  it("never includes another caller's model calls", async () => {
    const { listAgentActivityForCaller, recordRunResultForCaller } = await import("@/lib/repositories/test-run");
    const mine = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "activity-mine" })) as { run: TestRun };
    await recordRunResultForCaller("user-a", mine.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [{ role: "planner", modelId: "model-1", responseId: "mine" }],
      report: null,
    });

    const [projectB] = await db
      .insert(schema.project)
      .values({ id: "project-b-activity", userId: "user-b", applicationUrl: "https://b.example.com", repository: "b/repo" })
      .returning();
    const [scenarioB] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-b-activity", projectId: projectB!.id, objective: "b's objective" })
      .returning();
    const theirs = (await startRunForCaller("user-b", { scenarioId: scenarioB!.id, idempotencyKey: "activity-theirs" })) as {
      run: TestRun;
    };
    await recordRunResultForCaller("user-b", theirs.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [{ role: "planner", modelId: "model-1", responseId: "not-mine" }],
      report: null,
    });

    const entries = await listAgentActivityForCaller("user-a");
    expect(entries.map((e) => e.responseId)).toEqual(["mine"]);
  });
});

describe("listEnvironmentsForCaller — grouped-by-project rollup, ownership-fixture (SEC-009)", () => {
  it("a caller with no runs gets an empty list, not an error", async () => {
    const { listEnvironmentsForCaller } = await import("@/lib/repositories/test-run");
    expect(await listEnvironmentsForCaller("user-b")).toEqual([]);
  });

  it("groups runs by project and reports the last run's status/time plus a total count", async () => {
    const { listEnvironmentsForCaller, recordRunResultForCaller } = await import("@/lib/repositories/test-run");
    await startRunForCaller("user-a", { scenarioId, idempotencyKey: "env-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = (await startRunForCaller("user-a", { scenarioId, idempotencyKey: "env-2" })) as { run: TestRun };
    await recordRunResultForCaller("user-a", second.run.id, { status: "FAILED", errorReason: null, modelCalls: [], report: null });

    const environments = await listEnvironmentsForCaller("user-a");
    // lastRunStatus: "FAILED" (only the second run's status) is itself proof the newest row
    // won — not comparing lastRunAt against second.run.startedAt, which round-trips through
    // startRunForCaller's raw-SQL INSERT...RETURNING as a bare (timezone-less) string, unlike
    // the query-builder SELECT this repository function uses (a pre-existing, unrelated quirk
    // of rowToTestRun's `as Date` cast — not this function's logic).
    expect(environments).toHaveLength(1);
    expect(environments[0]).toMatchObject({
      projectId: "project-a",
      applicationUrl: "https://example.com",
      repository: "owner/repo",
      runCount: 2,
      lastRunStatus: "FAILED",
    });
    expect(environments[0]!.lastRunAt).toBeInstanceOf(Date);
  });

  it("never includes another caller's projects", async () => {
    const { listEnvironmentsForCaller } = await import("@/lib/repositories/test-run");
    await startRunForCaller("user-a", { scenarioId, idempotencyKey: "env-mine" });

    const [projectB] = await db
      .insert(schema.project)
      .values({ id: "project-b-env", userId: "user-b", applicationUrl: "https://b.example.com", repository: "b/repo" })
      .returning();
    const [scenarioB] = await db
      .insert(schema.testScenario)
      .values({ id: "scenario-b-env", projectId: projectB!.id, objective: "b's objective" })
      .returning();
    await startRunForCaller("user-b", { scenarioId: scenarioB!.id, idempotencyKey: "env-theirs" });

    const environments = await listEnvironmentsForCaller("user-a");
    expect(environments.map((e) => e.projectId)).toEqual(["project-a"]);
  });
});

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
let createScenarioForCaller: typeof import("@/lib/repositories/test-scenario").createScenarioForCaller;
let startRunForCaller: typeof import("@/lib/repositories/test-run").startRunForCaller;
let recordRunResultForCaller: typeof import("@/lib/repositories/test-run").recordRunResultForCaller;
let getRunForCaller: typeof import("@/lib/repositories/test-run").getRunForCaller;

const CALLER = "user-a";

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ createProjectForCaller } = await import("@/lib/repositories/project"));
  ({ createScenarioForCaller } = await import("@/lib/repositories/test-scenario"));
  ({ startRunForCaller, recordRunResultForCaller, getRunForCaller } = await import("@/lib/repositories/test-run"));

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

async function seedRun() {
  const project = await createProjectForCaller(CALLER, {
    applicationUrl: "https://example.com",
    repository: "owner/repo",
  });
  const scenario = await createScenarioForCaller(CALLER, {
    projectId: project.id,
    objective: "log in and reach the dashboard",
    credentialsReference: "secretsmanager://qaforge/scenario-credential/abc123",
  });
  if ("ok" in scenario) throw new Error("unexpected denial creating fixture scenario");
  const started = await startRunForCaller(CALLER, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });
  if ("ok" in started) throw new Error("unexpected denial starting fixture run");
  return { project, scenario, run: started.run };
}

function fixtureReport(): Report {
  return {
    result: "FAIL",
    steps: [
      {
        position: 0,
        action: "Navigate to login",
        expectedOutcome: "Login form renders",
        successCriteria: { kind: "url", match: "/login" },
        failureCriteria: { kind: "consoleAbsent", pattern: "error" },
        observed: "/login",
        status: "PASSED",
      },
      {
        position: 1,
        action: "Submit credentials",
        expectedOutcome: "Redirected to dashboard",
        successCriteria: { kind: "url", match: "/dashboard" },
        failureCriteria: { kind: "selectorPresent", selector: ".error-banner" },
        observed: "ELEMENT_NOT_FOUND",
        status: "FAILED",
      },
    ],
    evidence: [
      { id: "ev-console", stepId: "1", type: "CONSOLE", content: "[REDACTED] login failed", metadata: {} },
      { id: "ev-code", stepId: null, type: "CODE", content: "src/auth/login.ts:42", metadata: { relevance: 0.9 } },
    ],
    hypotheses: [
      {
        id: "hyp-winner",
        status: "SUPPORTED",
        description: "The login handler rejects valid credentials due to a stale session check",
        confidence: 0.85,
        evidenceLinks: [
          { evidenceRef: "ev-console", role: "SUPPORTING" },
          { evidenceRef: "ev-code", role: "SUPPORTING" },
        ],
        checks: [
          {
            check: { kind: "structured", evidenceId: "ev-console", criterion: { kind: "consoleAbsent", pattern: "error" } },
            passed: false,
          },
        ],
      },
      {
        id: "hyp-rejected",
        status: "REJECTED",
        description: "The dashboard route itself is unreachable",
        confidence: 0.2,
        evidenceLinks: [{ evidenceRef: "ev-code", role: "CONTRADICTING" }],
        checks: [
          {
            check: { kind: "semantic", evidenceId: "ev-code", assertion: "dashboard route exists in the router", passed: true },
            passed: true,
          },
        ],
      },
    ],
    winningHypothesisId: "hyp-winner",
    confidence: 0.85,
  };
}

describe("recordRunResultForCaller + getRunForCaller — US1 round-trip (FR-001/002/010/011/014/017)", () => {
  it("a completed run's findings are retrievable with identical content after the write", async () => {
    const { run } = await seedRun();
    const report = fixtureReport();

    const recorded = await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [{ role: "rootCause", modelId: "claude-x", responseId: "resp-1" }],
      report,
    });
    expect(recorded).toEqual({ ok: true, alreadyRecorded: false });

    const full = await getRunForCaller(CALLER, run.id);
    expect(full).not.toBeNull();
    expect(full!.status).toBe("FAILED");
    expect(full!.modelCalls).toEqual([{ role: "rootCause", modelId: "claude-x", responseId: "resp-1" }]);
    expect(full!.completedAt).not.toBeNull();

    expect(full!.steps).toHaveLength(2);
    expect(full!.steps.map((s) => s.status)).toEqual(["PASSED", "FAILED"]);

    expect(full!.evidence).toHaveLength(2);
    const codeEvidence = full!.evidence.find((e) => e.type === "CODE")!;
    expect(codeEvidence.stepId).toBeNull();
    const consoleEvidence = full!.evidence.find((e) => e.type === "CONSOLE")!;
    expect(consoleEvidence.stepId).toBe(full!.steps[1]!.id); // resolved from "1" (position) to the real generated step id

    expect(full!.hypotheses).toHaveLength(2);
    expect(full!.report).not.toBeNull();
    expect(full!.report!.result).toBe("FAIL");
    expect(full!.report!.winningHypothesisId).toBe("hyp-winner");
    expect(full!.report!.confidence).toBe(0.85);
  });

  it("report_hypothesis's row set always equals {h.id : h.run_id = report.run_id} (research.md #1's standing invariant)", async () => {
    const { run } = await seedRun();
    await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report: fixtureReport(),
    });

    const full = await getRunForCaller(CALLER, run.id);
    const reportHypothesisIds = full!.report!.hypotheses.map((h) => h.id).sort();
    const allHypothesisIdsForRun = full!.hypotheses.map((h) => h.id).sort();
    expect(reportHypothesisIds).toEqual(allHypothesisIdsForRun);
  });

  it("evidence content and the scenario's credential reference are stored verbatim, never a plaintext QAFORGE_CREDENTIAL value (SC-005)", async () => {
    const { scenario, run } = await seedRun();
    expect(scenario.credentialsReference).toBe("secretsmanager://qaforge/scenario-credential/abc123");
    expect(scenario.credentialsReference).not.toContain("hunter2");

    await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report: fixtureReport(),
    });

    const full = await getRunForCaller(CALLER, run.id);
    for (const item of full!.evidence) {
      expect(item.content).not.toContain("hunter2"); // fixture's fake plaintext credential never appears
    }
    const consoleEvidence = full!.evidence.find((e) => e.type === "CONSOLE")!;
    expect(consoleEvidence.content).toBe("[REDACTED] login failed"); // stored exactly as given, not further mangled
  });

  it("recordRunResultForCaller is a no-op the second time, not a report.run_id UNIQUE crash (research.md #5)", async () => {
    const { run } = await seedRun();
    const first = await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report: fixtureReport(),
    });
    expect(first).toEqual({ ok: true, alreadyRecorded: false });

    const second = await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report: fixtureReport(),
    });
    expect(second).toEqual({ ok: true, alreadyRecorded: true });

    const full = await getRunForCaller(CALLER, run.id);
    expect(full!.hypotheses).toHaveLength(2); // not duplicated
  });

  it("a PASS report round-trips with no hypotheses and a null winner (US1/AC2)", async () => {
    const { run } = await seedRun();
    const recorded = await recordRunResultForCaller(CALLER, run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [],
      report: { ...fixtureReport(), result: "PASS", hypotheses: [], winningHypothesisId: null, confidence: null },
    });
    expect(recorded).toEqual({ ok: true, alreadyRecorded: false });

    const full = await getRunForCaller(CALLER, run.id);
    expect(full!.status).toBe("PASSED");
    expect(full!.hypotheses).toHaveLength(0);
    expect(full!.report).not.toBeNull();
    expect(full!.report!.result).toBe("PASS");
    expect(full!.report!.winningHypothesisId).toBeNull();
    expect(full!.report!.hypotheses).toHaveLength(0); // report_hypothesis has nothing to link
  });

  it("an INCONCLUSIVE report keeps a null winner even with non-empty, unresolved hypotheses (FR-014)", async () => {
    const { run } = await seedRun();
    const report = fixtureReport();
    const inconclusiveHypotheses = report.hypotheses.map((h) => ({ ...h, status: "REJECTED" as const }));

    const recorded = await recordRunResultForCaller(CALLER, run.id, {
      status: "FAILED",
      errorReason: null,
      modelCalls: [],
      report: { ...report, result: "INCONCLUSIVE", hypotheses: inconclusiveHypotheses, winningHypothesisId: null },
    });
    expect(recorded).toEqual({ ok: true, alreadyRecorded: false });

    const full = await getRunForCaller(CALLER, run.id);
    expect(full!.hypotheses).toHaveLength(2); // still persisted — just none of them won
    expect(full!.hypotheses.every((h) => h.status === "REJECTED")).toBe(true);
    expect(full!.report!.result).toBe("INCONCLUSIVE");
    expect(full!.report!.winningHypothesisId).toBeNull();
  });

  it("a run with no report (e.g. an early ERROR) records the terminal status alone", async () => {
    const { run } = await seedRun();
    const recorded = await recordRunResultForCaller(CALLER, run.id, {
      status: "ERROR",
      errorReason: "OBJECTIVE_NOT_PLANNABLE",
      modelCalls: [],
      report: null,
    });
    expect(recorded).toEqual({ ok: true, alreadyRecorded: false });

    const full = await getRunForCaller(CALLER, run.id);
    expect(full!.status).toBe("ERROR");
    expect(full!.report).toBeNull();
    expect(full!.steps).toHaveLength(0);
  });

  it("user B cannot read user A's run — identical to a nonexistent id (FR-005/FR-006)", async () => {
    const { run } = await seedRun();
    await recordRunResultForCaller(CALLER, run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [],
      report: { ...fixtureReport(), result: "PASS", hypotheses: [], winningHypothesisId: null, confidence: null },
    });

    expect(await getRunForCaller("user-b", run.id)).toBeNull();
    expect(await getRunForCaller("user-b", "no-such-run")).toBeNull();
  });
});

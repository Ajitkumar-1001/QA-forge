import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  testRun,
  testScenario,
  project,
  testStep,
  evidence,
  hypothesis,
  hypothesisEvidence,
  report,
  reportHypothesis,
  type TestRun,
  type TestStep,
  type Evidence as EvidenceRow,
  type Hypothesis as HypothesisRow,
  type Report as ReportRow,
} from "@/db/schema";
import type { RunStatus, ErrorReason, ModelCall, Report } from "@/mastra/types";

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(["PASSED", "FAILED", "ERROR"]);

function rowToTestRun(row: Record<string, unknown>): TestRun {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    idempotencyKey: row.idempotency_key as string,
    status: row.status as TestRun["status"],
    errorReason: row.error_reason as TestRun["errorReason"],
    modelCalls: row.model_calls as TestRun["modelCalls"],
    startedAt: row.started_at as Date,
    completedAt: row.completed_at as Date | null,
  };
}

/**
 * Atomic, ownership-scoped insert-or-return-existing (research.md #4): folds ownership
 * (via the scenario -> project join) AND idempotency (ON CONFLICT) into one statement —
 * never a separate check-then-insert. `created: false` means an existing run for this
 * (scenarioId, idempotencyKey) was returned; that's a success case (FR-008), not an error.
 */
export async function startRunForCaller(
  callerId: string,
  input: { scenarioId: string; idempotencyKey: string },
): Promise<{ run: TestRun; created: boolean } | { ok: false; reason: "not_found_or_not_owned" }> {
  const newId = crypto.randomUUID();

  const inserted = await db.execute(sql`
    INSERT INTO ${testRun} (id, scenario_id, idempotency_key, status, started_at)
    SELECT ${newId}, ts.id, ${input.idempotencyKey}, 'PLANNING', now()
    FROM ${testScenario} ts
    JOIN ${project} p ON ts.project_id = p.id
    WHERE ts.id = ${input.scenarioId} AND p.user_id = ${callerId}
    ON CONFLICT (scenario_id, idempotency_key) DO NOTHING
    RETURNING *
  `);

  if (inserted.rows.length > 0) {
    return { run: rowToTestRun(inserted.rows[0] as Record<string, unknown>), created: true };
  }

  // Empty result is ambiguous by construction (research.md #4): not-found/not-owned, or a
  // genuine conflict. Re-select, scoped identically, to tell the two apart.
  const existing = await db
    .select({ run: testRun })
    .from(testRun)
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(
      and(
        eq(testScenario.id, input.scenarioId),
        eq(testRun.idempotencyKey, input.idempotencyKey),
        eq(project.userId, callerId),
      ),
    )
    .limit(1);

  const existingRun = existing[0]?.run;
  if (existingRun) {
    return { run: existingRun, created: false };
  }

  return { ok: false, reason: "not_found_or_not_owned" };
}

export type RecordRunResultInput = {
  status: RunStatus;
  errorReason: ErrorReason | null;
  modelCalls: ModelCall[];
  /** 001's actual Report shape — null for a run that never reached one (e.g. OBJECTIVE_NOT_PLANNABLE). */
  report: Report | null;
};

/**
 * SELECT ... FOR UPDATE-guarded transaction (research.md #5): verifies ownership and locks
 * the run row once, then every child insert happens inside the same transaction. Safe to
 * call twice for the same runId — no-ops if the run is already terminal, rather than
 * throwing on report.run_id's UNIQUE constraint (cli/run.ts's catch-all handler can
 * legitimately fire after this already succeeded once).
 */
export async function recordRunResultForCaller(
  callerId: string,
  runId: string,
  input: RecordRunResultInput,
): Promise<{ ok: true; alreadyRecorded: boolean } | { ok: false; reason: "not_found_or_not_owned" }> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .execute(
        sql`
          SELECT tr.id, tr.status
          FROM ${testRun} tr
          JOIN ${testScenario} ts ON tr.scenario_id = ts.id
          JOIN ${project} p ON ts.project_id = p.id
          WHERE tr.id = ${runId} AND p.user_id = ${callerId}
          FOR UPDATE OF tr
        `,
      )
      .then((r) => r.rows[0] as { id: string; status: string } | undefined);

    if (!locked) {
      return { ok: false, reason: "not_found_or_not_owned" } as const;
    }

    if (TERMINAL_STATUSES.has(locked.status as RunStatus)) {
      return { ok: true, alreadyRecorded: true } as const;
    }

    const r = input.report;

    if (r) {
      // Insert order is FK-required, not narrative (data-model.md's write-path note):
      // steps -> evidence -> hypotheses -> hypothesis_evidence -> report -> report_hypothesis.
      const steps = r.steps.map((step) => ({ id: crypto.randomUUID(), step }));
      const stepIdByPosition = new Map(steps.map(({ id, step }) => [step.position, id]));

      if (steps.length > 0) {
        await tx.insert(testStep).values(
          steps.map(({ id, step }) => ({
            id,
            runId,
            position: step.position,
            action: step.action,
            expectedOutcome: step.expectedOutcome,
            successCriteria: step.successCriteria,
            failureCriteria: step.failureCriteria,
            observed: step.observed,
            status: step.status,
          })),
        );
      }

      if (r.evidence.length > 0) {
        // 001 emits Evidence.stepId as String(position), not a real id (data-model.md) —
        // resolve via the position -> generated-id map built above; null passes through
        // unchanged (CODE evidence has no owning step).
        await tx.insert(evidence).values(
          r.evidence.map((item) => ({
            // Child-row FKs come only from $runId/transaction-local ids, never a
            // client-supplied field (contracts/repository-contract.md's invariant) —
            // item.id/item.type/item.content/item.metadata are 001's own already-redacted
            // output, not caller-asserted ownership data, so reusing them here is safe.
            id: item.id,
            runId,
            stepId: item.stepId === null ? null : (stepIdByPosition.get(Number(item.stepId)) ?? null),
            type: item.type,
            content: item.content,
            metadata: item.metadata,
          })),
        );
      }

      if (r.hypotheses.length > 0) {
        await tx.insert(hypothesis).values(
          r.hypotheses.map((h) => ({
            id: h.id,
            runId,
            description: h.description,
            confidence: h.confidence,
            status: h.status,
            checks: h.checks,
          })),
        );

        // Derived from each hypothesis's own evidenceLinks (001's shape) rather than a
        // separately-threaded param — dedupe by (hypothesisId, evidenceId) since nothing
        // upstream guarantees the model's evidenceLinks are free of duplicates
        // (research.md #5): last occurrence wins.
        const dedupedLinks = new Map<string, { hypothesisId: string; evidenceId: string; role: "SUPPORTING" | "CONTRADICTING" }>();
        for (const h of r.hypotheses) {
          for (const link of h.evidenceLinks) {
            dedupedLinks.set(`${h.id}:${link.evidenceRef}`, {
              hypothesisId: h.id,
              evidenceId: link.evidenceRef,
              role: link.role,
            });
          }
        }
        if (dedupedLinks.size > 0) {
          await tx.insert(hypothesisEvidence).values([...dedupedLinks.values()]);
        }
      }

      const reportId = crypto.randomUUID();
      await tx.insert(report).values({
        id: reportId,
        runId,
        result: r.result,
        winningHypothesisId: r.winningHypothesisId,
        confidence: r.confidence,
      });

      if (r.hypotheses.length > 0) {
        await tx.insert(reportHypothesis).values(r.hypotheses.map((h) => ({ reportId, hypothesisId: h.id })));
      }
    }

    await tx
      .update(testRun)
      .set({
        status: input.status,
        errorReason: input.errorReason,
        modelCalls: input.modelCalls,
        completedAt: new Date(),
      })
      .where(eq(testRun.id, runId));

    return { ok: true, alreadyRecorded: false } as const;
  });
}

export type FullRun = TestRun & {
  steps: TestStep[];
  evidence: EvidenceRow[];
  hypotheses: HypothesisRow[];
  report: (ReportRow & { hypotheses: HypothesisRow[] }) | null;
};

/**
 * Re-scopes ownership independently at every join level (research.md #6) rather than
 * trusting the top-level run lookup for its children — a future bug mis-scoping one
 * child query can't leak another user's evidence even if the parent lookup were wrong.
 */
export async function getRunForCaller(callerId: string, runId: string): Promise<FullRun | null> {
  const runRows = await db
    .select({ run: testRun })
    .from(testRun)
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(testRun.id, runId), eq(project.userId, callerId)))
    .limit(1);

  const run = runRows[0]?.run;
  if (!run) return null;

  const ownedChain = and(eq(testScenario.id, testRun.scenarioId), eq(project.userId, callerId));

  const stepRows = await db
    .select({ step: testStep })
    .from(testStep)
    .innerJoin(testRun, eq(testStep.runId, testRun.id))
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(testStep.runId, runId), ownedChain))
    .orderBy(testStep.position);

  const evidenceRows = await db
    .select({ evidence })
    .from(evidence)
    .innerJoin(testRun, eq(evidence.runId, testRun.id))
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(evidence.runId, runId), ownedChain));

  const hypothesisRows = await db
    .select({ hypothesis })
    .from(hypothesis)
    .innerJoin(testRun, eq(hypothesis.runId, testRun.id))
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(hypothesis.runId, runId), ownedChain));

  const reportRows = await db
    .select({ report })
    .from(report)
    .innerJoin(testRun, eq(report.runId, testRun.id))
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(report.runId, runId), ownedChain))
    .limit(1);

  const reportRow = reportRows[0]?.report ?? null;
  let reportHypotheses: HypothesisRow[] = [];
  if (reportRow) {
    const linkRows = await db
      .select({ hypothesis })
      .from(reportHypothesis)
      .innerJoin(hypothesis, eq(reportHypothesis.hypothesisId, hypothesis.id))
      .innerJoin(testRun, eq(hypothesis.runId, testRun.id))
      .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
      .innerJoin(project, eq(testScenario.projectId, project.id))
      .where(and(eq(reportHypothesis.reportId, reportRow.id), ownedChain));
    reportHypotheses = linkRows.map((r) => r.hypothesis);
  }

  return {
    ...run,
    steps: stepRows.map((r) => r.step),
    evidence: evidenceRows.map((r) => r.evidence),
    hypotheses: hypothesisRows.map((r) => r.hypothesis),
    report: reportRow ? { ...reportRow, hypotheses: reportHypotheses } : null,
  };
}

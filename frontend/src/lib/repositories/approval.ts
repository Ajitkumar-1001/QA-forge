import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approval, testRun, testScenario, project, githubConnection, linearConnection, type Approval } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { createGithubIssue, findExistingApprovalIssue } from "@/lib/github-api";
import { createLinearIssue, findExistingLinearIssue } from "@/lib/linear-api";
import { buildApprovalDraft } from "@/lib/approval-draft";
import { getSlackConnectionForCaller } from "@/lib/repositories/slack-connection";
import { getGithubConnectionForCaller } from "@/lib/repositories/github-connection";
import { postSlackNotification } from "@/lib/slack-api";
import type { Report } from "@/mastra/types";

// D9/GitHub-Write-Path (PRD §11/§14/§15): draft-generation + Approval creation is
// Application Service code that runs right after a report is persisted, not a further
// Mastra step or a background-worker hook — this codebase has no background worker (D7 was
// never built; both entry points already run the investigation synchronously and call
// recordRunResultForCaller inline), so "runs right after produceReport" here means "called
// by cli/run.ts and runs/actions.ts immediately after their own recordRunResultForCaller
// call succeeds," not a separate process picking up a persisted row.

const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Called once, immediately after recordRunResultForCaller persists a report (both
 * cli/run.ts and runs/actions.ts) — never for a PASS result (PASS never generates a
 * hypothesis or an approval, §2/§15) and never twice for the same run: run_id carries a
 * UNIQUE constraint, folded into this same INSERT as ON CONFLICT DO NOTHING, the same
 * idempotent-insert idiom startRunForCaller/upsertGithubConnectionForCaller already use.
 * Ownership is folded into the INSERT's own FROM/WHERE (Constitution III) rather than a
 * separate check-then-insert; callerId here has already been verified as the run's owner
 * moments earlier by recordRunResultForCaller in the same request, so this is defense in
 * depth, not the only gate.
 */
export async function createApprovalDraftForCaller(
  callerId: string,
  runId: string,
  runInfo: { objective: string; repository: string; applicationUrl: string },
  report: Report,
): Promise<void> {
  if (report.result === "PASS") return;

  const winningHypothesis = report.winningHypothesisId
    ? report.hypotheses.find((h) => h.id === report.winningHypothesisId)
    : undefined;
  const approvalId = crypto.randomUUID();
  const { title, body } = buildApprovalDraft(approvalId, runId, runInfo, report, winningHypothesis);

  await db.execute(sql`
    INSERT INTO ${approval} (id, run_id, status, draft_title, draft_body)
    SELECT ${approvalId}, ${runId}, 'PENDING', ${title}, ${body}
    FROM ${testRun} tr
    JOIN ${testScenario} ts ON tr.scenario_id = ts.id
    JOIN ${project} p ON ts.project_id = p.id
    WHERE tr.id = ${runId} AND p.user_id = ${callerId}
    ON CONFLICT (run_id) DO NOTHING
  `);

  // research.md Decision 1: scheduled via after(), not awaited — runs once the response has
  // already been sent, so a slow/failed Slack attempt can never add latency to or otherwise
  // affect this function's own caller (FR-007/FR-008, PRD FR-005/FR-008). after() only works
  // inside an actual Next.js request (Server Action/Route Handler) — it throws E468 outside
  // one. createApprovalDraftForCaller's other real caller, src/cli/run.ts, is a plain Node
  // script with no request scope and never can have one. Drift found during implementation
  // (2026-09-12), not anticipated by Decision 1 as originally written: fall back to awaiting
  // directly in that case. The CLI path has no waiting browser to keep fast — the user is
  // already watching the whole investigation run synchronously — so paying up to Slack's own
  // 10s timeout there doesn't violate FR-008's actual intent, only its literal wording.
  try {
    after(() => notifySlackForApproval(callerId, runId, approvalId, title));
  } catch (err) {
    if ((err as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE !== "E468") throw err;
    await notifySlackForApproval(callerId, runId, approvalId, title);
  }
}

/**
 * 008-slack-linear-integrations: private helper, not exported — createApprovalDraftForCaller
 * is its only caller, scheduled via after() (research.md Decision 1). Re-checks the caller's
 * GitHub connection at fire-time (research.md Decision 4, FR-019's suspend behavior) and
 * silently no-ops if absent or if no Slack connection exists — identical observable outcome
 * either way, matching FR-007's "only for a user who has connected Slack and still has
 * GitHub connected." On failure, logs via plain console.error — never the webhook URL or any
 * raw fetch error object (Constitution Principle IV; FR-013/FR-015).
 */
async function notifySlackForApproval(callerId: string, runId: string, approvalId: string, draftTitle: string): Promise<void> {
  const githubConnection = await getGithubConnectionForCaller(callerId);
  if (!githubConnection) return;

  const slackConnection = await getSlackConnectionForCaller(callerId);
  if (!slackConnection) return;

  const webhookUrl = decrypt(slackConnection.webhookUrlReference);
  const text = `${draftTitle}\n\nDecide: ${process.env.BETTER_AUTH_URL ?? ""}/runs/${runId}/approval`;
  const result = await postSlackNotification(webhookUrl, { text });
  if (!result.ok) {
    console.error("slack_notification_failed", { runId, approvalId, reason: result.reason });
  }
}

// A PENDING row past this deadline behaves as EXPIRED wherever it's observed (both here and
// inside approveForCaller/rejectForCaller's own locked read) — no separate sweep process
// exists to flip it, which also means there is no race between an in-flight approve() and a
// sweep (the exact interaction expert-system-design flagged against the PRD's original,
// separately-scheduled sweep design): the deadline check and the transition both happen
// inside the same request, sometimes the same transaction, that observes the row.
function isPastExpiry(row: { status: Approval["status"]; createdAt: Date }): boolean {
  return row.status === "PENDING" && Date.now() - row.createdAt.getTime() > APPROVAL_EXPIRY_MS;
}

/** Ownership-scoped read for the approval detail page; persists the lazy PENDING->EXPIRED
 * transition if this read is the one that first observes it past the deadline. */
export async function getApprovalForCaller(callerId: string, runId: string): Promise<Approval | null> {
  const rows = await db
    .select({ approval })
    .from(approval)
    .innerJoin(testRun, eq(approval.runId, testRun.id))
    .innerJoin(testScenario, eq(testRun.scenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(approval.runId, runId), eq(project.userId, callerId)))
    .limit(1);

  const row = rows[0]?.approval;
  if (!row) return null;

  if (isPastExpiry(row)) {
    await db.update(approval).set({ status: "EXPIRED" }).where(eq(approval.id, row.id));
    return { ...row, status: "EXPIRED" };
  }
  return row;
}

type DecisionFailure = { ok: false; reason: "not_found_or_not_owned" | "INVALID_TRANSITION" };

type ApproveResult = { ok: true; githubIssueUrl: string } | DecisionFailure | { ok: false; reason: "NO_GITHUB_CONNECTION" | "ISSUE_CREATION_FAILED" };

/**
 * Guarded PENDING->APPROVED transition (PRD §14), atomic against two simultaneous calls for
 * the same run: SELECT ... FOR UPDATE locks the row first, inside one transaction, so a
 * concurrent second call blocks until the first commits and then observes the now-APPROVED
 * row itself — never a read-then-write race (the same standard test-run.ts's own
 * recordRunResultForCaller already sets for this codebase, "FOR UPDATE OF" a chosen alias).
 * The lock is held across the outbound GitHub call deliberately: this is the one write the
 * whole product makes, human-triggered and low-frequency, not a hot path — trading a longer-
 * held row lock for a guaranteed-exactly-once external write is the right tradeoff here.
 */
export async function approveForCaller(callerId: string, runId: string): Promise<ApproveResult> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .execute(
        sql`
          SELECT a.id, a.status, a.draft_title, a.draft_body, a.github_issue_url,
                 EXTRACT(EPOCH FROM a.created_at) * 1000 AS created_at_ms, p.repository
          FROM ${approval} a
          JOIN ${testRun} tr ON a.run_id = tr.id
          JOIN ${testScenario} ts ON tr.scenario_id = ts.id
          JOIN ${project} p ON ts.project_id = p.id
          WHERE a.run_id = ${runId} AND p.user_id = ${callerId}
          FOR UPDATE OF a
        `,
      )
      .then(
        (r) =>
          r.rows[0] as
            | { id: string; status: Approval["status"]; draft_title: string; draft_body: string; github_issue_url: string | null; created_at_ms: number; repository: string }
            | undefined,
      );

    if (!locked) {
      return { ok: false, reason: "not_found_or_not_owned" };
    }

    // tx.execute's raw SQL result bypasses drizzle's schema-driven column typing (unlike
    // db.query.*, which parses timestamp columns into real Date objects) — a "timestamp
    // without time zone" column comes back as a plain, offset-less string (e.g. "2026-09-08
    // 16:08:06.876"), and new Date(thatString) is parsed as LOCAL time by JS, silently
    // shifting it by the process's UTC offset (found by running this exact query and
    // comparing against the typed query builder's result on the same row). EXTRACT(EPOCH...)
    // above sidesteps the ambiguity entirely by never producing a timezone-less string.
    if (isPastExpiry({ status: locked.status, createdAt: new Date(Number(locked.created_at_ms)) })) {
      await tx.update(approval).set({ status: "EXPIRED" }).where(eq(approval.id, locked.id));
      return { ok: false, reason: "INVALID_TRANSITION" };
    }

    if (locked.status === "APPROVED") {
      // Idempotent repeat call (PRD §14): return the existing issue, never write a second one.
      return { ok: true, githubIssueUrl: locked.github_issue_url! };
    }
    if (locked.status !== "PENDING") {
      // REJECTED or (already-persisted) EXPIRED.
      return { ok: false, reason: "INVALID_TRANSITION" };
    }

    // Deliberately not resolveGithubTokenForCaller (it queries via the module-level `db`,
    // not `tx`) — on this single-connection pglite test harness, a `db.*` call from inside
    // an open `db.transaction()` callback deadlocks: the transaction can't complete until
    // this query returns, and the query queues behind the very transaction blocking it
    // (found by running the concurrency test below, which hung instead of failing fast).
    // Scoped to `tx` instead, so it shares the same connection/transaction as the lock.
    const connectionRows = await tx
      .select({ patReference: githubConnection.patReference })
      .from(githubConnection)
      .where(eq(githubConnection.userId, callerId))
      .limit(1);
    const token = connectionRows[0] ? decrypt(connectionRows[0].patReference) : undefined;
    if (!token) {
      return { ok: false, reason: "NO_GITHUB_CONNECTION" };
    }

    const [owner, repo] = locked.repository.split("/");
    const marker = `<!-- qaforge-approval:${locked.id} -->`;

    const existing = await findExistingApprovalIssue(token, owner!, repo!, marker);
    let issueUrl: string;
    if (existing.found) {
      issueUrl = existing.htmlUrl;
    } else if (existing.found === false) {
      const created = await createGithubIssue(token, owner!, repo!, locked.draft_title, locked.draft_body);
      if (!created.ok) {
        // Left PENDING, not lost (PRD §14) — no update below, transaction just returns.
        return { ok: false, reason: "ISSUE_CREATION_FAILED" };
      }
      issueUrl = created.htmlUrl;
    } else {
      // The marker-search call itself failed (network/token) — can't confirm no duplicate
      // exists, so this is treated as the same failure bucket as a failed write, not as
      // license to create blindly.
      return { ok: false, reason: "ISSUE_CREATION_FAILED" };
    }

    await tx
      .update(approval)
      .set({ status: "APPROVED", githubIssueUrl: issueUrl, decidedAt: new Date(), decidedBy: callerId })
      .where(eq(approval.id, locked.id));
    return { ok: true, githubIssueUrl: issueUrl };
  });
}

/** Plain ownership-checked PENDING->REJECTED transition (PRD §14) — no GitHub call. */
export async function rejectForCaller(callerId: string, runId: string): Promise<{ ok: true } | DecisionFailure> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .execute(
        sql`
          SELECT a.id, a.status, EXTRACT(EPOCH FROM a.created_at) * 1000 AS created_at_ms
          FROM ${approval} a
          JOIN ${testRun} tr ON a.run_id = tr.id
          JOIN ${testScenario} ts ON tr.scenario_id = ts.id
          JOIN ${project} p ON ts.project_id = p.id
          WHERE a.run_id = ${runId} AND p.user_id = ${callerId}
          FOR UPDATE OF a
        `,
      )
      .then((r) => r.rows[0] as { id: string; status: Approval["status"]; created_at_ms: number } | undefined);

    if (!locked) {
      return { ok: false, reason: "not_found_or_not_owned" };
    }
    // See approveForCaller's identical comment: EXTRACT(EPOCH...) avoids the timezone-less-
    // string-parsed-as-local-time bug a plain raw-SQL timestamp read would otherwise hit.
    if (isPastExpiry({ status: locked.status, createdAt: new Date(Number(locked.created_at_ms)) })) {
      await tx.update(approval).set({ status: "EXPIRED" }).where(eq(approval.id, locked.id));
      return { ok: false, reason: "INVALID_TRANSITION" };
    }
    if (locked.status !== "PENDING") {
      return { ok: false, reason: "INVALID_TRANSITION" };
    }

    await tx.update(approval).set({ status: "REJECTED", decidedAt: new Date(), decidedBy: callerId }).where(eq(approval.id, locked.id));
    return { ok: true };
  });
}

type LinearWriteResult =
  | { ok: true; linearIssueUrl: string }
  | { ok: false; reason: "not_found_or_not_owned" | "NOT_APPROVED" | "NO_LINEAR_CONNECTION" | "NO_GITHUB_CONNECTION" }
  // FR-013 requires recoverable ("timeout"-shaped) vs non-recoverable ("invalid credential")
  // to be distinguished specifically for Linear (unlike GitHub's single collapsed
  // ISSUE_CREATION_FAILED bucket) — underlyingReason carries what data-model.md's original
  // signature collapsed away; found while wiring T020, since a caller can't surface FR-013's
  // distinction from a reason string that's always the same value.
  | { ok: false; reason: "ISSUE_CREATION_FAILED"; underlyingReason: "INVALID_KEY" | "LINEAR_UNREACHABLE" };

/**
 * 008-slack-linear-integrations: own transaction, sequenced after — never nested inside —
 * approveForCaller's existing transaction (Decision Log #4; called only from the approve
 * Server Action, after approveForCaller already returned ok:true). Own SELECT ... FOR UPDATE
 * lock on the Approval row, acquired before every check below runs — including NOT_APPROVED,
 * NO_GITHUB_CONNECTION, and both idempotency checks (Decision Log #8: a follow-up review
 * found that separating this transaction from GitHub's had silently dropped the lock the
 * idempotency checks depended on; this function's whole structure exists to not repeat that).
 * The GitHub/Linear connection lookups use `tx`, not the module-level `db` (matching
 * approveForCaller's own documented deadlock-avoidance comment above) — a `db.*` call from
 * inside an open `db.transaction()` callback deadlocks on this single-connection test
 * harness.
 */
export async function writeLinearIssueForApproval(callerId: string, runId: string): Promise<LinearWriteResult> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .execute(
        sql`
          SELECT a.id, a.status, a.draft_title, a.draft_body, a.linear_issue_url
          FROM ${approval} a
          JOIN ${testRun} tr ON a.run_id = tr.id
          JOIN ${testScenario} ts ON tr.scenario_id = ts.id
          JOIN ${project} p ON ts.project_id = p.id
          WHERE a.run_id = ${runId} AND p.user_id = ${callerId}
          FOR UPDATE OF a
        `,
      )
      .then(
        (r) =>
          r.rows[0] as
            | { id: string; status: Approval["status"]; draft_title: string; draft_body: string; linear_issue_url: string | null }
            | undefined,
      );

    if (!locked) {
      return { ok: false, reason: "not_found_or_not_owned" };
    }

    // Guards against retryLinearIssueAction reaching this function for a decision nobody
    // approved (Constitution Principle V/FR-016) — mirrors approveForCaller's own
    // locked.status guard, checked under this same lock, before either idempotency check.
    if (locked.status !== "APPROVED") {
      return { ok: false, reason: "NOT_APPROVED" };
    }

    // research.md Decision 4: live re-check, no stored suspended flag — the exact same
    // existence check gating creation, re-run here so a GitHub disconnect after approval
    // suspends the Linear write too (FR-019), with no second source of truth to keep in
    // sync.
    const githubRows = await tx.select({ id: githubConnection.id }).from(githubConnection).where(eq(githubConnection.userId, callerId)).limit(1);
    if (!githubRows[0]) {
      return { ok: false, reason: "NO_GITHUB_CONNECTION" };
    }

    const linearRows = await tx
      .select({ apiKeyReference: linearConnection.apiKeyReference, teamId: linearConnection.teamId })
      .from(linearConnection)
      .where(eq(linearConnection.userId, callerId))
      .limit(1);
    const linearRow = linearRows[0];
    if (!linearRow) {
      return { ok: false, reason: "NO_LINEAR_CONNECTION" };
    }

    // FR-010 [spec] check (a): the stored reference already set (write-succeeded-but-
    // persist-failed recovery from a PRIOR attempt, or simply already done) — return it,
    // never write a second one.
    if (locked.linear_issue_url) {
      return { ok: true, linearIssueUrl: locked.linear_issue_url };
    }

    const apiKey = decrypt(linearRow.apiKeyReference);
    const marker = `<!-- qaforge-approval:${locked.id} -->`;

    // FR-010 [spec] check (b): mirrors findExistingApprovalIssue's exact marker-search shape
    // (D9/GitHub-Write-Path), capped at the 100 most recent (Decision Log #9).
    const existing = await findExistingLinearIssue(apiKey, linearRow.teamId, marker);
    let issueUrl: string;
    if (existing.found) {
      issueUrl = existing.issueUrl;
    } else if (existing.found === false) {
      const created = await createLinearIssue(apiKey, linearRow.teamId, locked.draft_title, locked.draft_body);
      if (!created.ok) {
        await tx.update(approval).set({ linearIssueError: created.reason }).where(eq(approval.id, locked.id));
        return { ok: false, reason: "ISSUE_CREATION_FAILED", underlyingReason: created.reason };
      }
      issueUrl = created.issueUrl;
    } else {
      // The marker-search call itself failed (network/key) — can't confirm no duplicate
      // exists, so this is the same failure bucket as a failed write, not license to create
      // blindly (identical reasoning to findExistingApprovalIssue's own null-reason branch).
      await tx.update(approval).set({ linearIssueError: existing.reason }).where(eq(approval.id, locked.id));
      return { ok: false, reason: "ISSUE_CREATION_FAILED", underlyingReason: existing.reason };
    }

    await tx.update(approval).set({ linearIssueUrl: issueUrl, linearIssueError: null }).where(eq(approval.id, locked.id));
    return { ok: true, linearIssueUrl: issueUrl };
  });
}

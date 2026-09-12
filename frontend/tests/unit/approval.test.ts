import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Report } from "@/mastra/types";

// Needed by src/lib/crypto.ts (via upsertGithubConnectionForCaller's encrypt() call,
// exercised through resolveGithubTokenForCaller inside approveForCaller) — same convention
// tests/unit/github-connection.test.ts uses.
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

const createGithubIssueMock = vi.fn();
const findExistingApprovalIssueMock = vi.fn();
vi.mock("@/lib/github-api", () => ({
  createGithubIssue: (...args: unknown[]) => createGithubIssueMock(...args),
  findExistingApprovalIssue: (...args: unknown[]) => findExistingApprovalIssueMock(...args),
}));

// 008-slack-linear-integrations: postSlackNotification is the one external call
// notifySlackForApproval makes — mocked the same way github-api's calls already are.
// approval.ts imports only postSlackNotification from this module, so that's all this needs.
const postSlackNotificationMock = vi.fn();
vi.mock("@/lib/slack-api", () => ({
  postSlackNotification: (...args: unknown[]) => postSlackNotificationMock(...args),
}));

const createLinearIssueMock = vi.fn();
const findExistingLinearIssueMock = vi.fn();
vi.mock("@/lib/linear-api", () => ({
  createLinearIssue: (...args: unknown[]) => createLinearIssueMock(...args),
  findExistingLinearIssue: (...args: unknown[]) => findExistingLinearIssueMock(...args),
}));

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");
let buildApprovalDraft: typeof import("@/lib/approval-draft").buildApprovalDraft;
let createApprovalDraftForCaller: typeof import("@/lib/repositories/approval").createApprovalDraftForCaller;
let getApprovalForCaller: typeof import("@/lib/repositories/approval").getApprovalForCaller;
let approveForCaller: typeof import("@/lib/repositories/approval").approveForCaller;
let rejectForCaller: typeof import("@/lib/repositories/approval").rejectForCaller;
let upsertGithubConnectionForCaller: typeof import("@/lib/repositories/github-connection").upsertGithubConnectionForCaller;
let upsertSlackConnectionForCaller: typeof import("@/lib/repositories/slack-connection").upsertSlackConnectionForCaller;
let upsertLinearConnectionForCaller: typeof import("@/lib/repositories/linear-connection").upsertLinearConnectionForCaller;
let writeLinearIssueForApproval: typeof import("@/lib/repositories/approval").writeLinearIssueForApproval;

const RUN_INFO = { objective: "load the homepage", repository: "owner/repo", applicationUrl: "https://example.com" };

function failReport(overrides: Partial<Report> = {}): Report {
  return {
    result: "FAIL",
    steps: [
      { position: 0, action: "Load /", expectedOutcome: "renders", successCriteria: { kind: "url", match: "/" }, failureCriteria: { kind: "consoleAbsent", pattern: "error" }, observed: "500 error page", status: "FAILED" },
    ],
    evidence: [],
    hypotheses: [{ id: "hyp-1", description: "The server 500s on /", confidence: 0.9, status: "SUPPORTED", evidenceLinks: [], checks: [] }],
    winningHypothesisId: "hyp-1",
    confidence: 0.9,
    ...overrides,
  };
}

const PASS_REPORT: Report = { result: "PASS", steps: [], evidence: [], hypotheses: [], winningHypothesisId: null, confidence: null };

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ buildApprovalDraft } = await import("@/lib/approval-draft"));
  ({ createApprovalDraftForCaller, getApprovalForCaller, approveForCaller, rejectForCaller, writeLinearIssueForApproval } = await import(
    "@/lib/repositories/approval"
  ));
  ({ upsertGithubConnectionForCaller } = await import("@/lib/repositories/github-connection"));
  ({ upsertSlackConnectionForCaller } = await import("@/lib/repositories/slack-connection"));
  ({ upsertLinearConnectionForCaller } = await import("@/lib/repositories/linear-connection"));
  createGithubIssueMock.mockReset();
  findExistingApprovalIssueMock.mockReset();
  postSlackNotificationMock.mockReset();
  createLinearIssueMock.mockReset();
  findExistingLinearIssueMock.mockReset();

  await db.delete(schema.approval);
  await db.delete(schema.testRun);
  await db.delete(schema.testScenario);
  await db.delete(schema.project);
  await db.delete(schema.githubConnection);
  await db.delete(schema.slackConnection);
  await db.delete(schema.linearConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@example.com" },
    { id: "user-b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(schema.project).values({ id: "project-a", userId: "user-a", applicationUrl: RUN_INFO.applicationUrl, repository: RUN_INFO.repository });
  await db.insert(schema.testScenario).values({ id: "scenario-a", projectId: "project-a", objective: RUN_INFO.objective });
  await db.insert(schema.testRun).values({ id: "run-a", scenarioId: "scenario-a", idempotencyKey: "k1", status: "FAILED", completedAt: new Date() });
});

describe("buildApprovalDraft — deterministic templating (Constitution I), no LLM call", () => {
  it("titles and bodies the draft from the winning hypothesis when one exists", () => {
    const report = failReport();
    const { title, body } = buildApprovalDraft("ap-1", "run-a", RUN_INFO, report, report.hypotheses[0]);
    expect(title).toBe("QAForge: The server 500s on /");
    expect(body).toContain("The server 500s on /");
    expect(body).toContain("Load /");
    expect(body).toContain("500 error page");
    expect(body).toContain("<!-- qaforge-approval:ap-1 -->");
  });

  it("falls back to the objective when no hypothesis reached SUPPORTED (INCONCLUSIVE)", () => {
    const report = failReport({ result: "INCONCLUSIVE", winningHypothesisId: null });
    const { title, body } = buildApprovalDraft("ap-2", "run-a", RUN_INFO, report, undefined);
    expect(title).toBe("QAForge investigation was inconclusive: load the homepage");
    expect(body).toContain("No hypothesis reached SUPPORTED status.");
  });
});

describe("createApprovalDraftForCaller — draft creation right after a persisted report", () => {
  it("creates a PENDING row for a FAIL report, owned by the caller", async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("PENDING");
    expect(row?.draftTitle).toContain("500s on /");
  });

  it("never creates a row for a PASS report", async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, PASS_REPORT);
    expect(await db.query.approval.findFirst()).toBeUndefined();
  });

  it("is idempotent — calling twice for the same run creates exactly one row", async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
    const rows = await db.query.approval.findMany({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(rows).toHaveLength(1);
  });

  it("no-ops (creates nothing) when the caller doesn't own the run", async () => {
    await createApprovalDraftForCaller("user-b", "run-a", RUN_INFO, failReport());
    expect(await db.query.approval.findFirst()).toBeUndefined();
  });

  // 008-slack-linear-integrations (T009): after() throws E468 outside a real Next.js
  // request, so in this Vitest environment createApprovalDraftForCaller always takes the
  // fallback branch and awaits notifySlackForApproval directly (see approval.ts's comment).
  // That means the "zero added latency" half of FR-008 is NOT unit-testable here — it's a
  // property of after() itself, only observable in a real request (an e2e concern, T012).
  // What IS unit-testable, and is tested below: a Slack failure never prevents/alters the
  // Approval row, and the failure log never contains the webhook URL (FR-008, FR-015).
  describe("Slack notification (FR-007/FR-008/FR-015)", () => {
    beforeEach(async () => {
      await upsertGithubConnectionForCaller("user-a", { pat: "ghp_fake", scopes: "contents:read,issues:write" });
    });

    it("posts exactly once when both GitHub and Slack are connected", async () => {
      await upsertSlackConnectionForCaller("user-a", { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" });
      postSlackNotificationMock.mockResolvedValue({ ok: true });

      await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
      expect(postSlackNotificationMock).toHaveBeenCalledTimes(1);
    });

    it("never posts when the caller has no Slack connection", async () => {
      await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
      expect(postSlackNotificationMock).not.toHaveBeenCalled();
    });

    it("never posts when Slack is connected but GitHub is not (FR-019 suspend behavior) — no-ops exactly like no connection at all", async () => {
      await upsertSlackConnectionForCaller("user-b", { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" });
      await db.insert(schema.project).values({ id: "project-b", userId: "user-b", applicationUrl: RUN_INFO.applicationUrl, repository: RUN_INFO.repository });
      await db.insert(schema.testScenario).values({ id: "scenario-b", projectId: "project-b", objective: RUN_INFO.objective });
      await db.insert(schema.testRun).values({ id: "run-b", scenarioId: "scenario-b", idempotencyKey: "k2", status: "FAILED", completedAt: new Date() });

      await createApprovalDraftForCaller("user-b", "run-b", RUN_INFO, failReport());
      expect(postSlackNotificationMock).not.toHaveBeenCalled();
    });

    it("a Slack failure never prevents the Approval row from being created", async () => {
      await upsertSlackConnectionForCaller("user-a", { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" });
      postSlackNotificationMock.mockResolvedValue({ ok: false, reason: "SLACK_UNREACHABLE" });

      await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
      const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
      expect(row?.status).toBe("PENDING");
    });

    it("a Slack failure is logged without ever including the webhook URL (Constitution Principle IV)", async () => {
      await upsertSlackConnectionForCaller("user-a", { webhookUrl: "https://hooks.slack.com/services/T00/B00/super-secret-path" });
      postSlackNotificationMock.mockResolvedValue({ ok: false, reason: "SLACK_REJECTED" });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedArgs = errorSpy.mock.calls[0];
      expect(JSON.stringify(loggedArgs)).not.toContain("super-secret-path");
      expect(JSON.stringify(loggedArgs)).not.toContain("https://hooks.slack.com");
      errorSpy.mockRestore();
    });

    it("a successful Slack post logs nothing", async () => {
      await upsertSlackConnectionForCaller("user-a", { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" });
      postSlackNotificationMock.mockResolvedValue({ ok: true });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});

describe("getApprovalForCaller — ownership scoping and lazy 24h expiry", () => {
  beforeEach(async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
  });

  it("returns null when no approval exists", async () => {
    await db.delete(schema.approval);
    expect(await getApprovalForCaller("user-a", "run-a")).toBeNull();
  });

  it("returns the row for its owner", async () => {
    const result = await getApprovalForCaller("user-a", "run-a");
    expect(result?.status).toBe("PENDING");
  });

  it("returns null for a caller who doesn't own the run", async () => {
    expect(await getApprovalForCaller("user-b", "run-a")).toBeNull();
  });

  it("a PENDING row older than 24h reads as EXPIRED and is persisted as such", async () => {
    await db.update(schema.approval).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(schema.approval.runId, "run-a"));

    const result = await getApprovalForCaller("user-a", "run-a");
    expect(result?.status).toBe("EXPIRED");

    const persisted = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(persisted?.status).toBe("EXPIRED");
  });
});

describe("approveForCaller — guarded PENDING->APPROVED transition, the one external write (PRD §14)", () => {
  beforeEach(async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
    await upsertGithubConnectionForCaller("user-a", { pat: "ghp_fake", scopes: "contents:read,issues:write" });
  });

  it("not_found_or_not_owned when no approval exists for this run/caller", async () => {
    expect(await approveForCaller("user-a", "no-such-run")).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("not_found_or_not_owned when another caller tries to approve", async () => {
    expect(await approveForCaller("user-b", "run-a")).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("NO_GITHUB_CONNECTION when the caller has never connected GitHub — no API call attempted", async () => {
    await db.delete(schema.githubConnection);
    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "NO_GITHUB_CONNECTION" });
    expect(createGithubIssueMock).not.toHaveBeenCalled();
    expect(findExistingApprovalIssueMock).not.toHaveBeenCalled();
  });

  it("happy path: creates the issue, persists the URL, marks APPROVED with decidedBy/decidedAt", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    createGithubIssueMock.mockResolvedValue({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/1" });

    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/1" });
    expect(createGithubIssueMock).toHaveBeenCalledTimes(1);

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("APPROVED");
    expect(row?.githubIssueUrl).toBe("https://github.com/owner/repo/issues/1");
    expect(row?.decidedBy).toBe("user-a");
    expect(row?.decidedAt).not.toBeNull();
  });

  it("repeating approve on an already-APPROVED row returns the existing URL without a second write", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    createGithubIssueMock.mockResolvedValue({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/1" });

    await approveForCaller("user-a", "run-a");
    const second = await approveForCaller("user-a", "run-a");

    expect(second).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/1" });
    expect(createGithubIssueMock).toHaveBeenCalledTimes(1);
  });

  it("a found duplicate-issue marker skips creation and adopts the existing issue", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: true, htmlUrl: "https://github.com/owner/repo/issues/42" });

    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/42" });
    expect(createGithubIssueMock).not.toHaveBeenCalled();

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("APPROVED");
  });

  it("a GitHub write failure leaves the row PENDING, not lost (PRD §14 ISSUE_CREATION_FAILED)", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    createGithubIssueMock.mockResolvedValue({ ok: false, reason: "GITHUB_UNREACHABLE" });

    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "ISSUE_CREATION_FAILED" });

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("PENDING");
    expect(row?.githubIssueUrl).toBeNull();
  });

  it("a failed marker-search is treated as a failure, not license to create blindly", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: null, reason: "GITHUB_UNREACHABLE" });

    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "ISSUE_CREATION_FAILED" });
    expect(createGithubIssueMock).not.toHaveBeenCalled();

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("PENDING");
  });

  it("INVALID_TRANSITION on an already-REJECTED row — no GitHub call", async () => {
    await rejectForCaller("user-a", "run-a");
    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    expect(createGithubIssueMock).not.toHaveBeenCalled();
  });

  it("a PENDING row past its 24h deadline is treated (and persisted) as EXPIRED — INVALID_TRANSITION, no GitHub call", async () => {
    await db.update(schema.approval).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(schema.approval.runId, "run-a"));

    const result = await approveForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    expect(createGithubIssueMock).not.toHaveBeenCalled();

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("EXPIRED");
  });

  // PGlite is single-connection (its own README) — the two Promise.all-issued calls below
  // execute sequentially on one connection, so this does not exercise a true concurrent
  // race between overlapping Postgres connections the way test-run.test.ts's own identical
  // caveat describes for startRunForCaller. The atomicity guarantee (SELECT ... FOR UPDATE
  // holding the row lock across the GitHub call, inside one transaction) is correct by
  // construction in real Postgres regardless; what this test actually proves is that the
  // guard converges both calls onto exactly one GitHub write and one shared result.
  it("exactly one GitHub issue is created for two simultaneous approve calls on the same run", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    createGithubIssueMock.mockResolvedValue({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/7" });

    const [first, second] = await Promise.all([approveForCaller("user-a", "run-a"), approveForCaller("user-a", "run-a")]);

    expect(first).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/7" });
    expect(second).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/7" });
    expect(createGithubIssueMock).toHaveBeenCalledTimes(1);
  });

  // 008-slack-linear-integrations (T029, SC-004): "the existing GitHub-issue-creation
  // success rate is unchanged after this feature ships" — flagged with zero task coverage
  // by /speckit-analyze until this task closed it. approveForCaller itself was never
  // modified by this feature (only writeLinearIssueForApproval, a separate function called
  // separately by the Server Action layer) — this test is the regression guard that keeps
  // that true on purpose, not by accident.
  it("SC-004: approveForCaller's own result and side effects for a caller with no Linear connection are identical to pre-feature behavior", async () => {
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    createGithubIssueMock.mockResolvedValue({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/9" });

    const result = await approveForCaller("user-a", "run-a");

    expect(result).toEqual({ ok: true, githubIssueUrl: "https://github.com/owner/repo/issues/9" });
    expect(createLinearIssueMock).not.toHaveBeenCalled();
    expect(findExistingLinearIssueMock).not.toHaveBeenCalled();

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("APPROVED");
    expect(row?.githubIssueUrl).toBe("https://github.com/owner/repo/issues/9");
    expect(row?.linearIssueUrl).toBeNull();
    expect(row?.linearIssueError).toBeNull();
  });
});

// 008-slack-linear-integrations (T019/T020/T021): the concurrency test here is not
// optional per this feature's own history — a follow-up PRD review found the exact race
// this test guards once already, after an earlier fix had already "closed" it.
describe("writeLinearIssueForApproval — own transaction, own FOR UPDATE lock (Decision Log #4/#8)", () => {
  beforeEach(async () => {
    await upsertGithubConnectionForCaller("user-a", { pat: "ghp_fake", scopes: "contents:read,issues:write" });
    createGithubIssueMock.mockResolvedValue({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/1" });
    findExistingApprovalIssueMock.mockResolvedValue({ found: false });
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
    await approveForCaller("user-a", "run-a"); // now APPROVED — the precondition writeLinearIssueForApproval requires
  });

  it("returns NOT_APPROVED for a still-PENDING decision — closes the path a replayed retry could otherwise exploit (Constitution Principle V/FR-016)", async () => {
    await db.insert(schema.testRun).values({ id: "run-b", scenarioId: "scenario-a", idempotencyKey: "k2", status: "FAILED", completedAt: new Date() });
    await createApprovalDraftForCaller("user-a", "run-b", RUN_INFO, failReport()); // never approved
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });

    const result = await writeLinearIssueForApproval("user-a", "run-b");
    expect(result).toEqual({ ok: false, reason: "NOT_APPROVED" });
    expect(createLinearIssueMock).not.toHaveBeenCalled();
  });

  it("returns NO_LINEAR_CONNECTION when the caller has none", async () => {
    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "NO_LINEAR_CONNECTION" });
  });

  it("returns NO_GITHUB_CONNECTION when GitHub was disconnected after approval (FR-019 suspend behavior)", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    await db.delete(schema.githubConnection).where(eq(schema.githubConnection.userId, "user-a"));

    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "NO_GITHUB_CONNECTION" });
    expect(createLinearIssueMock).not.toHaveBeenCalled();
  });

  it("idempotency check (a): a stored linearIssueUrl is returned without any new Linear call", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    await db.update(schema.approval).set({ linearIssueUrl: "https://linear.app/team/issue/ENG-1" }).where(eq(schema.approval.runId, "run-a"));

    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: true, linearIssueUrl: "https://linear.app/team/issue/ENG-1" });
    expect(findExistingLinearIssueMock).not.toHaveBeenCalled();
    expect(createLinearIssueMock).not.toHaveBeenCalled();
  });

  it("idempotency check (b): the write-succeeded-but-persist-failed case is recovered via marker-search, not re-created", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    findExistingLinearIssueMock.mockResolvedValue({ found: true, issueUrl: "https://linear.app/team/issue/ENG-2" });

    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: true, linearIssueUrl: "https://linear.app/team/issue/ENG-2" });
    expect(createLinearIssueMock).not.toHaveBeenCalled();

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.linearIssueUrl).toBe("https://linear.app/team/issue/ENG-2");
  });

  it("neither idempotency check finds anything — creates a new issue and persists it", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    findExistingLinearIssueMock.mockResolvedValue({ found: false });
    createLinearIssueMock.mockResolvedValue({ ok: true, issueUrl: "https://linear.app/team/issue/ENG-3" });

    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: true, linearIssueUrl: "https://linear.app/team/issue/ENG-3" });
    expect(createLinearIssueMock).toHaveBeenCalledTimes(1);
  });

  it("a creation failure records linear_issue_error, leaves linear_issue_url null, and never touches the already-APPROVED status or the GitHub issue (FR-011)", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    findExistingLinearIssueMock.mockResolvedValue({ found: false });
    createLinearIssueMock.mockResolvedValue({ ok: false, reason: "LINEAR_UNREACHABLE" });

    const result = await writeLinearIssueForApproval("user-a", "run-a");
    expect(result).toEqual({ ok: false, reason: "ISSUE_CREATION_FAILED", underlyingReason: "LINEAR_UNREACHABLE" });

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("APPROVED");
    expect(row?.githubIssueUrl).toBe("https://github.com/owner/repo/issues/1");
    expect(row?.linearIssueUrl).toBeNull();
    expect(row?.linearIssueError).toBe("LINEAR_UNREACHABLE");
  });

  it("exactly one Linear issue is created for two simultaneous writeLinearIssueForApproval calls on the same decision — the exact regression a follow-up PRD review found and fixed once already", async () => {
    await upsertLinearConnectionForCaller("user-a", { apiKey: "lin_key", teamId: "team-1", teamName: "Eng" });
    findExistingLinearIssueMock.mockResolvedValue({ found: false });
    createLinearIssueMock.mockResolvedValue({ ok: true, issueUrl: "https://linear.app/team/issue/ENG-7" });

    const [first, second] = await Promise.all([
      writeLinearIssueForApproval("user-a", "run-a"),
      writeLinearIssueForApproval("user-a", "run-a"),
    ]);

    expect(first).toEqual({ ok: true, linearIssueUrl: "https://linear.app/team/issue/ENG-7" });
    expect(second).toEqual({ ok: true, linearIssueUrl: "https://linear.app/team/issue/ENG-7" });
    expect(createLinearIssueMock).toHaveBeenCalledTimes(1); // the FOR UPDATE lock, not luck
  });
});

describe("rejectForCaller — plain ownership-checked PENDING->REJECTED, no GitHub call ever", () => {
  beforeEach(async () => {
    await createApprovalDraftForCaller("user-a", "run-a", RUN_INFO, failReport());
  });

  it("rejects a PENDING approval", async () => {
    const result = await rejectForCaller("user-a", "run-a");
    expect(result).toEqual({ ok: true });

    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("REJECTED");
    expect(row?.decidedBy).toBe("user-a");
    expect(createGithubIssueMock).not.toHaveBeenCalled();
    expect(findExistingApprovalIssueMock).not.toHaveBeenCalled();
  });

  it("not_found_or_not_owned for another caller", async () => {
    expect(await rejectForCaller("user-b", "run-a")).toEqual({ ok: false, reason: "not_found_or_not_owned" });
  });

  it("INVALID_TRANSITION when already REJECTED", async () => {
    await rejectForCaller("user-a", "run-a");
    expect(await rejectForCaller("user-a", "run-a")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });

  it("INVALID_TRANSITION on a PENDING row past its 24h deadline, and persists EXPIRED", async () => {
    await db.update(schema.approval).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(schema.approval.runId, "run-a"));

    expect(await rejectForCaller("user-a", "run-a")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    const row = await db.query.approval.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.runId, "run-a") });
    expect(row?.status).toBe("EXPIRED");
  });
});

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";
import {
  RUN_STATUS_VALUES,
  ERROR_REASON_VALUES,
  STEP_STATUS_VALUES,
  EVIDENCE_TYPE_VALUES,
  HYPOTHESIS_STATUS_VALUES,
  HYPOTHESIS_EVIDENCE_ROLE_VALUES,
  REPORT_RESULT_VALUES,
  APPROVAL_STATUS_VALUES,
} from "./enums";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),

    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),

    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_userId_idx").on(table.userId),

    unique("account_providerId_accountId_unique").on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  githubConnection: many(githubConnection),
  slackConnection: many(slackConnection),
  linearConnection: many(linearConnection),
  projects: many(project),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const githubConnection = pgTable("github_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  patReference: text("pat_reference").notNull(),

  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const githubConnectionRelations = relations(githubConnection, ({ one }) => ({
  user: one(user, {
    fields: [githubConnection.userId],
    references: [user.id],
  }),
}));

export type GithubConnection = typeof githubConnection.$inferSelect;

// --- 008-slack-linear-integrations ---
// Exact mirrors of github_connection's shape (data-model.md; research.md Decision 6: three
// explicit mirrors, not one polymorphic table). Linear carries two extra columns (team_id,
// team_name) resolved at connect time — see research.md Decision 7's two-step connect flow.
export const slackConnection = pgTable("slack_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  webhookUrlReference: text("webhook_url_reference").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const slackConnectionRelations = relations(slackConnection, ({ one }) => ({
  user: one(user, {
    fields: [slackConnection.userId],
    references: [user.id],
  }),
}));

export type SlackConnection = typeof slackConnection.$inferSelect;

export const linearConnection = pgTable("linear_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  apiKeyReference: text("api_key_reference").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const linearConnectionRelations = relations(linearConnection, ({ one }) => ({
  user: one(user, {
    fields: [linearConnection.userId],
    references: [user.id],
  }),
}));

export type LinearConnection = typeof linearConnection.$inferSelect;

// --- 003-durable-run-persistence ---
// Ownership chain: user -> project -> test_scenario -> test_run -> (test_step, evidence,
// hypothesis, report). See .specify/specs/003-durable-run-persistence/data-model.md for the
// full spec this section implements verbatim (columns, constraints, cascade behavior).
// No GithubConnection/Approval table — explicitly out of scope (FR-016).

export const testRunStatusEnum = pgEnum("test_run_status", RUN_STATUS_VALUES);

export const testRunErrorReasonEnum = pgEnum("test_run_error_reason", ERROR_REASON_VALUES);

export const testStepStatusEnum = pgEnum("test_step_status", STEP_STATUS_VALUES);

export const evidenceTypeEnum = pgEnum("evidence_type", EVIDENCE_TYPE_VALUES);

export const hypothesisStatusEnum = pgEnum("hypothesis_status", HYPOTHESIS_STATUS_VALUES);

export const hypothesisEvidenceRoleEnum = pgEnum("hypothesis_evidence_role", HYPOTHESIS_EVIDENCE_ROLE_VALUES);

export const reportResultEnum = pgEnum("report_result", REPORT_RESULT_VALUES);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    applicationUrl: text("application_url").notNull(),
    repository: text("repository").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("project_userId_idx").on(table.userId)],
);

export const testScenario = pgTable(
  "test_scenario",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),

    objective: text("objective").notNull(),
    credentialsReference: text("credentials_reference"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("test_scenario_projectId_idx").on(table.projectId)],
);

// --- 005-run-launch-ui ---
// 1:1 with test_scenario, same shape as report <-> test_run (003) — a credential's
// lifecycle is entirely owned by the scenario that needed it. test_scenario.
// credentials_reference stores this row's id when one exists (still an untyped text
// column, per 003's own "opaque pointer" design — see data-model.md).
export const credential = pgTable(
  "credential",
  {
    id: text("id").primaryKey(),
    testScenarioId: text("test_scenario_id")
      .notNull()
      .unique()
      .references(() => testScenario.id, { onDelete: "cascade" }),

    encryptedValue: text("encrypted_value").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const credentialRelations = relations(credential, ({ one }) => ({
  testScenario: one(testScenario, { fields: [credential.testScenarioId], references: [testScenario.id] }),
}));

export type Credential = typeof credential.$inferSelect;

export const testRun = pgTable(
  "test_run",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => testScenario.id, { onDelete: "cascade" }),

    idempotencyKey: text("idempotency_key").notNull(),
    status: testRunStatusEnum("status").default("PLANNING").notNull(),
    errorReason: testRunErrorReasonEnum("error_reason"),
    modelCalls: jsonb("model_calls").default([]).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    // scenarioId is the leading column of this unique index, so it already covers
    // scenario-scoped lookups (leftmost-prefix rule) — no separate index() needed.
    unique("test_run_scenarioId_idempotencyKey_unique").on(table.scenarioId, table.idempotencyKey),
  ],
);

export const testStep = pgTable(
  "test_step",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => testRun.id, { onDelete: "cascade" }),

    position: integer("position").notNull(),
    action: text("action").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    successCriteria: jsonb("success_criteria").notNull(),
    failureCriteria: jsonb("failure_criteria").notNull(),
    observed: text("observed"),
    status: testStepStatusEnum("status").notNull(),
  },
  (table) => [
    // runId is the leading column of this unique index — same reasoning as test_run above.
    unique("test_step_runId_position_unique").on(table.runId, table.position),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => testRun.id, { onDelete: "cascade" }),
    stepId: text("step_id").references(() => testStep.id, { onDelete: "cascade" }),

    type: evidenceTypeEnum("type").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("evidence_runId_idx").on(table.runId)],
);

export const hypothesis = pgTable(
  "hypothesis",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => testRun.id, { onDelete: "cascade" }),

    description: text("description").notNull(),
    confidence: real("confidence").notNull(),
    status: hypothesisStatusEnum("status").notNull(),
    checks: jsonb("checks").default([]).notNull(),
  },
  (table) => [index("hypothesis_runId_idx").on(table.runId)],
);

export const hypothesisEvidence = pgTable(
  "hypothesis_evidence",
  {
    hypothesisId: text("hypothesis_id")
      .notNull()
      .references(() => hypothesis.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    role: hypothesisEvidenceRoleEnum("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.hypothesisId, table.evidenceId] })],
);

export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .unique()
      .references(() => testRun.id, { onDelete: "cascade" }),
    winningHypothesisId: text("winning_hypothesis_id").references(() => hypothesis.id, { onDelete: "set null" }),

    result: reportResultEnum("result").notNull(),
    confidence: real("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const reportHypothesis = pgTable(
  "report_hypothesis",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    hypothesisId: text("hypothesis_id")
      .notNull()
      .references(() => hypothesis.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.hypothesisId] })],
);

// --- D9/GitHub-Write-Path (PRD §15) ---
// 1:1 with test_run (unique runId), same shape as report <-> test_run (003) — an Approval's
// lifecycle is entirely owned by the run whose FAIL/INCONCLUSIVE report produced it. Never
// created for a PASS report (approval.ts's createApprovalDraftForCaller enforces this).
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUS_VALUES);

export const approval = pgTable(
  "approval",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .unique()
      .references(() => testRun.id, { onDelete: "cascade" }),

    status: approvalStatusEnum("status").default("PENDING").notNull(),
    draftTitle: text("draft_title").notNull(),
    draftBody: text("draft_body").notNull(),
    githubIssueUrl: text("github_issue_url"),
    // 008-slack-linear-integrations: parity with githubIssueUrl (data-model.md). No column
    // stores a Linear marker — like GitHub's, it's derived deterministically from this row's
    // own id at read time, never stored.
    linearIssueUrl: text("linear_issue_url"),
    linearIssueError: text("linear_issue_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    // set null (not cascade) on user deletion: an already-decided Approval's history
    // shouldn't vanish along with the deciding user's account — matches report's own
    // winningHypothesisId "set null" precedent for a similar informational-only pointer.
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  },
);

export const approvalRelations = relations(approval, ({ one }) => ({
  testRun: one(testRun, { fields: [approval.runId], references: [testRun.id] }),
  decidedByUser: one(user, { fields: [approval.decidedBy], references: [user.id] }),
}));

export type Approval = typeof approval.$inferSelect;

export const projectRelations = relations(project, ({ one, many }) => ({
  user: one(user, { fields: [project.userId], references: [user.id] }),
  testScenarios: many(testScenario),
}));

export const testScenarioRelations = relations(testScenario, ({ one, many }) => ({
  project: one(project, { fields: [testScenario.projectId], references: [project.id] }),
  testRuns: many(testRun),
  credential: one(credential),
}));

export const testRunRelations = relations(testRun, ({ one, many }) => ({
  testScenario: one(testScenario, { fields: [testRun.scenarioId], references: [testScenario.id] }),
  testSteps: many(testStep),
  evidence: many(evidence),
  hypotheses: many(hypothesis),
  report: one(report),
  approval: one(approval),
}));

export const testStepRelations = relations(testStep, ({ one, many }) => ({
  testRun: one(testRun, { fields: [testStep.runId], references: [testRun.id] }),
  evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  testRun: one(testRun, { fields: [evidence.runId], references: [testRun.id] }),
  testStep: one(testStep, { fields: [evidence.stepId], references: [testStep.id] }),
  hypothesisEvidence: many(hypothesisEvidence),
}));

export const hypothesisRelations = relations(hypothesis, ({ one, many }) => ({
  testRun: one(testRun, { fields: [hypothesis.runId], references: [testRun.id] }),
  hypothesisEvidence: many(hypothesisEvidence),
  reportHypothesis: many(reportHypothesis),
}));

export const hypothesisEvidenceRelations = relations(hypothesisEvidence, ({ one }) => ({
  hypothesis: one(hypothesis, { fields: [hypothesisEvidence.hypothesisId], references: [hypothesis.id] }),
  evidence: one(evidence, { fields: [hypothesisEvidence.evidenceId], references: [evidence.id] }),
}));

export const reportRelations = relations(report, ({ one, many }) => ({
  testRun: one(testRun, { fields: [report.runId], references: [testRun.id] }),
  winningHypothesis: one(hypothesis, { fields: [report.winningHypothesisId], references: [hypothesis.id] }),
  reportHypothesis: many(reportHypothesis),
}));

export const reportHypothesisRelations = relations(reportHypothesis, ({ one }) => ({
  report: one(report, { fields: [reportHypothesis.reportId], references: [report.id] }),
  hypothesis: one(hypothesis, { fields: [reportHypothesis.hypothesisId], references: [hypothesis.id] }),
}));

export type Project = typeof project.$inferSelect;
export type TestScenario = typeof testScenario.$inferSelect;
export type TestRun = typeof testRun.$inferSelect;
export type TestStep = typeof testStep.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Hypothesis = typeof hypothesis.$inferSelect;
export type HypothesisEvidence = typeof hypothesisEvidence.$inferSelect;
export type Report = typeof report.$inferSelect;
export type ReportHypothesis = typeof reportHypothesis.$inferSelect;

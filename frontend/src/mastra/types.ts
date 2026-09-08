import type { StepCriterion } from "./schemas/step-criterion.schema";
import type { Hypothesis } from "./schemas/hypothesis.schema";
import type {
  RUN_STATUS_VALUES,
  ERROR_REASON_VALUES,
  STEP_STATUS_VALUES,
  EVIDENCE_TYPE_VALUES,
  REPORT_RESULT_VALUES,
} from "../db/enums";

// Derived from src/db/enums.ts's `as const` tuples — the same single source of truth
// 003-durable-run-persistence's schema.ts uses for its pgEnum columns, so the DB-allowed
// value set and this runtime type can't silently drift apart.
export type RunStatus = (typeof RUN_STATUS_VALUES)[number];

export type ErrorReason = (typeof ERROR_REASON_VALUES)[number];

export interface ModelCall {
  role: "planner" | "rootCause" | "validator";
  modelId: string;
  responseId: string;
}

export interface Run {
  objective: string;
  applicationUrl: string;
  repository: string;

  hasCredential: boolean;
  status: RunStatus;
  errorReason: ErrorReason | null;
  startedAt: Date;
  completedAt: Date | null;
  modelCalls: ModelCall[];
}

export type StepStatus = (typeof STEP_STATUS_VALUES)[number];

export interface Step {
  position: number;
  action: string;
  expectedOutcome: string;
  successCriteria: StepCriterion;
  failureCriteria: StepCriterion;
  observed: string | null;
  status: StepStatus;
}

export type EvidenceType = (typeof EVIDENCE_TYPE_VALUES)[number];

export type ReportResult = (typeof REPORT_RESULT_VALUES)[number];

export interface Report {
  result: ReportResult;
  steps: Step[];
  evidence: Evidence[];

  hypotheses: Hypothesis[];

  winningHypothesisId: string | null;
  confidence: number | null;
}

export interface Evidence {

  id: string;

  stepId: string | null;
  type: EvidenceType;

  content: string;
  metadata: Record<string, unknown>;
}

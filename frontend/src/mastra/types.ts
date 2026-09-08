import type { StepCriterion } from "./schemas/step-criterion.schema";
import type { Hypothesis } from "./schemas/hypothesis.schema";

export type RunStatus = "PLANNING" | "RUNNING" | "INVESTIGATING" | "PASSED" | "FAILED" | "ERROR";

export type ErrorReason =
  | "LIMIT_EXCEEDED"
  | "APP_UNREACHABLE"
  | "OBJECTIVE_NOT_PLANNABLE"
  | "REPO_ACCESS_DENIED"
  | "LLM_PROVIDER_ERROR";

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

export type StepStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED";

export interface Step {
  position: number;
  action: string;
  expectedOutcome: string;
  successCriteria: StepCriterion;
  failureCriteria: StepCriterion;
  observed: string | null;
  status: StepStatus;
}

export type EvidenceType = "CONSOLE" | "NETWORK" | "DOM" | "CODE" | "HTTP";

export type ReportResult = "PASS" | "FAIL" | "INCONCLUSIVE";

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

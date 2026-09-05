import type { StepCriterion } from "./schemas/step-criterion.schema";
import type { Hypothesis } from "./schemas/hypothesis.schema";

export type RunStatus = "PLANNING" | "RUNNING" | "INVESTIGATING" | "PASSED" | "FAILED" | "ERROR";

/**
 * NFR-001/SEC-001's reason codes (data-model.md) — the list is explicitly "etc." in data-model.md,
 * not yet exhaustive; extend here as later tasks (e.g. T018) name additional codes.
 */
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
  /**
   * Data-model.md: "never held as a Run field in plaintext." A boolean, not the credential value
   * itself — the actual secret flows through as an input to whatever consumes it (the login step)
   * and is never assigned to this object, so this type cannot leak it even if serialized or logged
   * (Constitution Principle IV).
   */
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

/** No SCREENSHOT type (FR-005, amended 2026-09-04) and no TRACE type (no agent tracing infra). */
export type EvidenceType = "CONSOLE" | "NETWORK" | "DOM" | "CODE" | "HTTP";

export type ReportResult = "PASS" | "FAIL" | "INCONCLUSIVE";

/**
 * The single terminal output of a Run (FR-012, data-model.md). Added during T039 implementation —
 * data-model.md describes this entity in prose but never named a TS type for it.
 */
export interface Report {
  result: ReportResult;
  steps: Step[];
  evidence: Evidence[];
  /** Every hypothesis evaluated this run, regardless of result — empty only for PASS (FR-004). */
  hypotheses: Hypothesis[];
  /** Non-null only when result === 'FAIL'. */
  winningHypothesisId: string | null;
  confidence: number | null;
}

export interface Evidence {
  /**
   * Added 2026-09-04 during T037 implementation — data-model.md's Evidence table has no `id`
   * field, but `ValidationCheck.evidenceId` (validation.schema.ts) and `Hypothesis.evidenceLinks`
   * (hypothesis.schema.ts) both need something to point at. Filling this gap here rather than
   * leaving both of those fields unusable in practice.
   */
  id: string;
  /** Null for CODE evidence from the Repository Investigator — not produced by any one Step. */
  stepId: string | null;
  type: EvidenceType;
  /** Already redacted per FR-006/SEC-002 before this object exists — never post-hoc. */
  content: string;
  metadata: Record<string, unknown>;
}

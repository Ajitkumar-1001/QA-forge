// Single source of truth for every enum-like value set 003-durable-run-persistence's
// schema (pgEnum, below) and 001's runtime types (mastra/types.ts,
// mastra/schemas/hypothesis.schema.ts) both need, so the two can't silently drift apart.
// Zero dependencies of its own — safe for drizzle-kit's schema-load path, which must not
// pull in the zod/agent layer via schema.ts (see plan.md's Structure Decision).

export const RUN_STATUS_VALUES = ["PLANNING", "RUNNING", "INVESTIGATING", "PASSED", "FAILED", "ERROR"] as const;

export const ERROR_REASON_VALUES = [
  "LIMIT_EXCEEDED",
  "APP_UNREACHABLE",
  "OBJECTIVE_NOT_PLANNABLE",
  "REPO_ACCESS_DENIED",
  "LLM_PROVIDER_ERROR",
] as const;

export const STEP_STATUS_VALUES = ["PENDING", "RUNNING", "PASSED", "FAILED"] as const;

export const EVIDENCE_TYPE_VALUES = ["CONSOLE", "NETWORK", "DOM", "CODE", "HTTP", "SCREENSHOT"] as const;

export const HYPOTHESIS_STATUS_VALUES = ["PROPOSED", "VALIDATING", "SUPPORTED", "REJECTED"] as const;

export const HYPOTHESIS_EVIDENCE_ROLE_VALUES = ["SUPPORTING", "CONTRADICTING"] as const;

export const REPORT_RESULT_VALUES = ["PASS", "FAIL", "INCONCLUSIVE"] as const;

// D9/GitHub-Write-Path: PRD §15's Approval state machine. EXPIRED is reached lazily (no
// background worker exists in this codebase — see approval.ts's own comment), not via a
// periodic sweep process, but the value set itself is unchanged from the PRD's shape.
export const APPROVAL_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const;

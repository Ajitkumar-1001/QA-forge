import { describe, expect, it } from "vitest";
import { evaluateHypothesis } from "@/mastra/agents/validator.agent";
import type { ValidationCheck } from "@/mastra/schemas/validation.schema";
import type { HypothesisCandidate } from "@/mastra/schemas/hypothesis.schema";
import type { Evidence } from "@/mastra/types";

/**
 * T050, 2026-09-04 `/speckit-converge` (CRITICAL) — before this fix, no prompt ever showed the
 * model a real `Evidence.id`, so a structured check's `evidenceId` could never resolve against
 * `evidenceById`, and `evaluateHypothesis` rejected the hypothesis regardless of whether the
 * underlying claim was true. These tests exercise the actual code-side resolution path directly
 * (no LLM call — `evaluateHypothesis`/`checkPasses` are pure functions), proving a real evidence
 * id now resolves, and that a genuine mismatch still correctly fails closed (this must NOT become
 * fail-open as a side effect of the fix).
 */
const CANDIDATE: HypothesisCandidate = {
  description: "The login middleware rejects a valid session and redirects back to /login",
  confidence: 0.9,
  evidenceLinks: [{ evidenceRef: "evidence-1", role: "SUPPORTING" }],
};

const EVIDENCE: Evidence[] = [
  {
    id: "evidence-1",
    stepId: "0",
    type: "NETWORK",
    content: '{"url":"/dashboard","status":302}',
    metadata: {},
  },
];

describe("evaluateHypothesis — real evidence-id resolution (T050, FR-010, Constitution I)", () => {
  it("reaches SUPPORTED when a structured check cites the real evidence id and the criterion holds", () => {
    const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));
    const checks: ValidationCheck[] = [
      { kind: "structured", evidenceId: "evidence-1", criterion: { kind: "url", match: "/dashboard" } },
    ];

    const result = evaluateHypothesis(CANDIDATE, checks, evidenceById);

    expect(result.status).toBe("SUPPORTED");
  });

  it("still rejects a check whose evidenceId doesn't resolve to any real evidence (fail-closed, not fail-open)", () => {
    const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));
    const checks: ValidationCheck[] = [
      {
        kind: "structured",
        evidenceId: "hallucinated-id-that-does-not-exist",
        criterion: { kind: "url", match: "/dashboard" },
      },
    ];

    const result = evaluateHypothesis(CANDIDATE, checks, evidenceById);

    expect(result.status).toBe("REJECTED");
  });

  it("rejects when the real evidence id resolves but the criterion itself doesn't hold", () => {
    const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));
    const checks: ValidationCheck[] = [
      { kind: "structured", evidenceId: "evidence-1", criterion: { kind: "url", match: "/nonexistent-path" } },
    ];

    const result = evaluateHypothesis(CANDIDATE, checks, evidenceById);

    expect(result.status).toBe("REJECTED");
  });

  it("never reaches a terminal verdict from an all-semantic check set, however it comes out (T053, Constitution I)", () => {
    const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));

    const passingSemanticOnly: ValidationCheck[] = [
      { kind: "semantic", evidenceId: "evidence-1", assertion: "the redirect confirms this", passed: true },
    ];
    const failingSemanticOnly: ValidationCheck[] = [
      { kind: "semantic", evidenceId: "evidence-1", assertion: "the redirect confirms this", passed: false },
    ];

    // Neither an all-passing nor an all-failing semantic-only check set may decide SUPPORTED or
    // REJECTED — code has contributed nothing but a trivial AND over the model's own self-report,
    // which Constitution I doesn't accept as "deterministic code evaluating structured evidence."
    expect(evaluateHypothesis(CANDIDATE, passingSemanticOnly, evidenceById).status).toBe("VALIDATING");
    expect(evaluateHypothesis(CANDIDATE, failingSemanticOnly, evidenceById).status).toBe("VALIDATING");
  });

  it("persists the code-computed per-check outcome, not only the originally-proposed check (T059)", () => {
    const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));
    const checks: ValidationCheck[] = [
      { kind: "structured", evidenceId: "evidence-1", criterion: { kind: "url", match: "/nonexistent-path" } },
    ];

    const result = evaluateHypothesis(CANDIDATE, checks, evidenceById);

    expect(result.checks).toEqual([{ check: checks[0], passed: false }]);
  });
});

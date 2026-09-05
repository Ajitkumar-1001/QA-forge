import { z } from "zod";
import type { ValidationCheck } from "./validation.schema";

export const evidenceLinkSchema = z.object({
  evidenceRef: z.string(),
  role: z.enum(["SUPPORTING", "CONTRADICTING"]),
});

/** What the Root Cause Agent emits per hypothesis (FR-009, PRD §9.6). Status and checks are added
 * afterward by the workflow, not part of the model's own structured output. */
export const hypothesisCandidateSchema = z.object({
  description: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceLinks: z.array(evidenceLinkSchema),
});

/** FR-009: at least two competing hypotheses, never just one — and no more than five, so an
 * unbounded hypothesis count can't become its own resource-exhaustion vector (every hypothesis
 * costs at least one further LLM call to validate). Added 2026-09-04 (`/review` checklist pass,
 * CHK011) — the floor existed from the start; the ceiling didn't. */
export const rootCauseOutputSchema = z.object({
  hypotheses: z.array(hypothesisCandidateSchema).min(2).max(5),
});

export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type HypothesisCandidate = z.infer<typeof hypothesisCandidateSchema>;
export type HypothesisStatus = "PROPOSED" | "VALIDATING" | "SUPPORTED" | "REJECTED";

/** The full runtime entity (data-model.md). `id` added during T039 implementation — same gap as
 * Evidence.id: `Report.winningHypothesisId` needs something to point at. */
export interface Hypothesis extends HypothesisCandidate {
  id: string;
  status: HypothesisStatus;
  checks: ValidationCheck[];
}

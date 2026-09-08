import { z } from "zod";
import type { EvaluatedCheck } from "./validation.schema";
import { HYPOTHESIS_EVIDENCE_ROLE_VALUES } from "../../db/enums";
import type { HYPOTHESIS_STATUS_VALUES } from "../../db/enums";

export const evidenceLinkSchema = z.object({
  evidenceRef: z.string(),
  role: z.enum(HYPOTHESIS_EVIDENCE_ROLE_VALUES),
});

export const hypothesisCandidateSchema = z.object({
  description: z.string(),
  confidence: z.number().min(0).max(1),

  evidenceLinks: z.array(evidenceLinkSchema).min(1),
});

export const rootCauseOutputSchema = z.object({
  hypotheses: z.array(hypothesisCandidateSchema).min(2).max(5),
});

export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type HypothesisCandidate = z.infer<typeof hypothesisCandidateSchema>;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUS_VALUES)[number];

export interface Hypothesis extends HypothesisCandidate {
  id: string;
  status: HypothesisStatus;

  checks: EvaluatedCheck[];
}

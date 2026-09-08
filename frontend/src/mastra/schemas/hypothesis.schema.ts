import { z } from "zod";
import type { EvaluatedCheck } from "./validation.schema";

export const evidenceLinkSchema = z.object({
  evidenceRef: z.string(),
  role: z.enum(["SUPPORTING", "CONTRADICTING"]),
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
export type HypothesisStatus = "PROPOSED" | "VALIDATING" | "SUPPORTED" | "REJECTED";

export interface Hypothesis extends HypothesisCandidate {
  id: string;
  status: HypothesisStatus;

  checks: EvaluatedCheck[];
}

import { describe, it } from "vitest";

/**
 * BLOCKED on T031–T039 (evidence/repository tools' live wrappers, root-cause/validator agents,
 * the composite investigation-round step's real wiring, and `qa-investigation.workflow.ts`'s
 * actual `dountil(...).branch([...]).commit()` composition) — plan.md's own description of this
 * file requires exercising the REAL Mastra workflow with a mocked model and a fake browser tool;
 * writing it against anything less would not be this test. Recorded as explicit `.todo`s rather
 * than silently dropped from tasks.md, or faked as passing against nothing.
 */
describe.todo("qa-investigation workflow — FAIL sub-test (SUPPORTED verdict reached)", () => {
  it.todo(
    "produces a FAIL report whose winningHypothesisId matches the SUPPORTED hypothesis (FR-009, FR-010)",
  );
  it.todo(
    "includes every hypothesis evaluated this run in Report.hypotheses, not just the winner (SC-006)",
  );
  it.todo("cites the SUPPORTED hypothesis's supporting evidence in the report (FR-009)");
});

import { z } from "zod";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { chromium, type Page } from "playwright";
import { createNavigateTool, installNavigationGuard } from "../tools/browser/navigate.tool";
import { startSsrfProxy, toLaunchProxyOption } from "../tools/browser/ssrf-proxy";
import { createEvidenceRecorder, createEvidenceTool } from "../tools/browser/evidence.tool";
import { executeStepAction } from "../agents/browser-execution.agent";
import {
  createInvestigationRoundDeps,
  investigationRoundStateSchema,
  investigationRoundOutputSchema,
  runInvestigationRound,
  type InvestigationRoundDeps,
  type Verdict,
} from "./investigation-round.step";
import type { PlannedStep } from "../schemas/test-plan.schema";
import type { StepCriterion } from "../schemas/step-criterion.schema";
import type { Hypothesis } from "../schemas/hypothesis.schema";
import type { Evidence, Report, Step as StepEntity } from "../types";

/**
 * The post-loop `.branch()`'s two verdict predicates, pinned as literal negations per
 * `expert-system-design`'s second-pass finding (research.md §2, 2026-09-04) — NOT re-derived from
 * the `dountil` exit condition's `iterationCount >= N`, and NOT an enumeration of the
 * non-SUPPORTED verdict values. Either of those alternatives reintroduces the double-fire/no-fire
 * bug this exact loop has already been fixed for twice: `iterationCount >= N` can be true the
 * same round `verdict` becomes `'SUPPORTED'` (both branches fire); an enumeration silently
 * under-fires if the verdict type ever gains a value neither branch names. A true negation is
 * exhaustive and mutually exclusive by construction, regardless of how the loop's exit was
 * reached.
 */
export function isSupportedVerdict(inputData: { verdict: Verdict }): boolean {
  return inputData.verdict === "SUPPORTED";
}

export function isBudgetExhaustedVerdict(inputData: { verdict: Verdict }): boolean {
  return !isSupportedVerdict(inputData);
}

/** The investigation loop's own output — hypotheses plus the FAIL/INCONCLUSIVE decision.
 * `runQaInvestigation` below merges this with the steps/evidence execute-scenario already
 * collected to produce the full `Report`. */
interface InvestigationOutcome {
  result: "FAIL" | "INCONCLUSIVE";
  hypotheses: Hypothesis[];
  winningHypothesisId: string | null;
  confidence: number | null;
}

const investigationOutcomeSchema = z.custom<InvestigationOutcome>();

const produceFailReportStep = createStep({
  id: "produce-fail-report",
  inputSchema: investigationRoundOutputSchema,
  outputSchema: investigationOutcomeSchema,
  execute: async ({ inputData }) => {
    const hypotheses = inputData.triedHypotheses as Hypothesis[];
    const winning = hypotheses.find((h) => h.status === "SUPPORTED");
    const outcome: InvestigationOutcome = {
      result: "FAIL",
      hypotheses,
      winningHypothesisId: winning?.id ?? null,
      confidence: winning?.confidence ?? null,
    };
    return outcome;
  },
});

const produceInconclusiveReportStep = createStep({
  id: "produce-inconclusive-report",
  inputSchema: investigationRoundOutputSchema,
  outputSchema: investigationOutcomeSchema,
  execute: async ({ inputData }) => {
    const outcome: InvestigationOutcome = {
      result: "INCONCLUSIVE",
      hypotheses: inputData.triedHypotheses as Hypothesis[],
      winningHypothesisId: null,
      confidence: null,
    };
    return outcome;
  },
});

/**
 * `dountil(investigation-round-step, verdict==='SUPPORTED' || iterationCount>=N).branch([...])`
 * — exactly two mutually-exclusive outcomes (never a `REJECTED` terminal branch). `REJECTED`/
 * `VALIDATING` are NOT terminal — they're what keeps the loop running, per PRD §10. Built fresh
 * per run (not a single static module-level instance): the composite loop step's deps need this
 * run's own repoUrl/objective/GitHub token/evidence, and evidence specifically isn't known until
 * a scenario step has actually failed.
 */
function buildInvestigationWorkflow(deps: InvestigationRoundDeps, maxIterations: number) {
  const loopStep = createStep({
    id: "investigation-round",
    inputSchema: investigationRoundStateSchema,
    outputSchema: investigationRoundOutputSchema,
    execute: async ({ inputData }) => runInvestigationRound(deps, inputData),
  });

  return createWorkflow({
    id: "qa-investigation-loop",
    inputSchema: investigationRoundStateSchema,
    outputSchema: investigationOutcomeSchema,
  })
    .dountil(
      loopStep,
      async ({ inputData, iterationCount }) =>
        isSupportedVerdict(inputData) || iterationCount >= maxIterations,
    )
    .branch([
      [async ({ inputData }) => isSupportedVerdict(inputData), produceFailReportStep],
      [async ({ inputData }) => isBudgetExhaustedVerdict(inputData), produceInconclusiveReportStep],
    ])
    .commit();
}

/** Deterministic, code-decided step-criterion check against live page state (Constitution
 * Principle I) — the same predicate shapes `validator.agent.ts` evaluates against captured
 * Evidence, applied here against the live browser instead. */
async function checkCriterion(
  criterion: StepCriterion,
  page: Page,
  consoleMessages: string[],
  lastStatus: number | null,
): Promise<boolean> {
  switch (criterion.kind) {
    case "url":
      return page.url().includes(criterion.match);
    case "selectorPresent":
      return (await page.locator(criterion.selector).count()) > 0;
    case "selectorAbsent":
      return (await page.locator(criterion.selector).count()) === 0;
    case "consoleAbsent":
      return !consoleMessages.some((message) => new RegExp(criterion.pattern).test(message));
    case "httpStatus":
      if (lastStatus === null) return false;
      if (criterion.in) return criterion.in.includes(lastStatus);
      if (criterion.notIn) return !criterion.notIn.includes(lastStatus);
      return true;
  }
}

export interface QaInvestigationInput {
  objective: string;
  applicationUrl: string;
  repoUrl: string;
  githubToken?: string;
  credentialValue?: string;
  steps: PlannedStep[];
  /** NFR-001's "max agent loops" — tunable via `--max-steps`, contracts/cli-contract.md. */
  maxIterations?: number;
}

/**
 * The main workflow (FR-004, FR-009–FR-011, Constitution Principle I, NFR-001). Caller (T040)
 * runs `generateTestPlan` (test-planner.agent) first — FR-002's unplannable short-circuit happens
 * before a Report is even attempted (exit 3, contracts/cli-contract.md), never inside here.
 *
 *   executeStep × N (browser-execution.agent + actions.tool, §9.3)
 *         │
 *         ├── every step PASSED ──────────────────────────────► PASS REPORT (no investigation, FR-004)
 *         ▼
 *   a step FAILED → collectEvidence (evidence.tool, in-tool redaction)
 *         │
 *         ▼
 *   qa-investigation-loop (dountil + branch, above) ──────────► FAIL or INCONCLUSIVE REPORT
 *
 * The PASS-vs-investigate split is a plain code check (`allPassed`), not a second Mastra
 * `.branch()`: it's a one-shot fact, not a bounded loop needing `dountil`'s termination
 * guarantee, and Mastra's `.branch()` output (a key-per-branch union) doesn't chain cleanly into a
 * *different* schema per path without an awkward intermediate extraction step. The loop that
 * genuinely needs Mastra's own iteration-counting and verified branch semantics — the
 * investigation round — still goes through `dountil`/`.branch()` exactly as designed and tested
 * (T029). Constitution Principle I is unaffected: PASS-vs-investigate is a direct field check, not
 * an LLM verdict.
 */
export async function runQaInvestigation(input: QaInvestigationInput): Promise<Report> {
  const maxIterations = input.maxIterations ?? 3;
  const proxy = await startSsrfProxy();
  const browser = await chromium.launch({ proxy: toLaunchProxyOption(proxy) });

  const executedSteps: StepEntity[] = [];
  let evidence: Evidence[] = [];
  let allPassed = true;

  try {
    const context = await browser.newContext();
    await installNavigationGuard(context);
    const page = await context.newPage();
    const recorder = createEvidenceRecorder(page, input.credentialValue);
    const consoleMessages: string[] = [];

    const navigateTool = createNavigateTool(page);
    const initialNav = (await navigateTool.execute!(
      { url: input.applicationUrl },
      {} as never,
    )) as { status: number | null; redirectChain: string[] };
    const lastStatus = initialNav.status;

    for (const plannedStep of input.steps) {
      let observed: string | null = null;
      let status: StepEntity["status"] = "RUNNING";

      try {
        await executeStepAction(page, input.applicationUrl, plannedStep.action);
        const succeeded = await checkCriterion(
          plannedStep.successCriteria,
          page,
          consoleMessages,
          lastStatus,
        );
        status = succeeded ? "PASSED" : "FAILED";
        observed = page.url();
      } catch (error) {
        status = "FAILED";
        observed = (error as Error).message;
      }

      executedSteps.push({
        position: plannedStep.position,
        action: plannedStep.action,
        expectedOutcome: plannedStep.expectedOutcome,
        successCriteria: plannedStep.successCriteria,
        failureCriteria: plannedStep.failureCriteria,
        observed,
        status,
      });

      if (status !== "PASSED") {
        allPassed = false;
        const evidenceTool = createEvidenceTool(page, recorder, {
          credentialValue: input.credentialValue,
          redirectChain: initialNav.redirectChain,
        });
        const collected = (await evidenceTool.execute!(
          { stepId: String(plannedStep.position) },
          {} as never,
        )) as { evidence: Evidence[] };
        evidence = collected.evidence;
        break;
      }
    }
  } finally {
    await browser.close();
    await proxy.close();
  }

  if (allPassed) {
    return {
      result: "PASS",
      steps: executedSteps,
      evidence: [],
      hypotheses: [],
      winningHypothesisId: null,
      confidence: null,
    };
  }

  const deps = createInvestigationRoundDeps({
    objective: input.objective,
    repoUrl: input.repoUrl,
    githubToken: input.githubToken,
    evidence,
  });
  const workflow = buildInvestigationWorkflow(deps, maxIterations);
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { triedHypotheses: [], searchHistory: [] } });

  if (result.status !== "success") {
    throw new Error(`Investigation workflow did not complete successfully: ${result.status}`);
  }

  // `.branch()`'s actual runtime output is keyed by whichever branch step fired (confirmed
  // empirically — its own type signature returns `{[stepId]?: T}`, and `investigationOutcomeSchema`
  // being declared as the *workflow's* outputSchema does NOT unwrap that at runtime, whatever the
  // type checker believes with `z.custom<T>()` in the way). Exactly one of these two keys is ever
  // present, matching the two mutually-exclusive branch conditions above.
  const branchResult = result.result as unknown as Record<
    "produce-fail-report" | "produce-inconclusive-report",
    InvestigationOutcome | undefined
  >;
  const outcome = branchResult["produce-fail-report"] ?? branchResult["produce-inconclusive-report"];

  if (!outcome) {
    throw new Error("Investigation workflow completed without producing an outcome");
  }

  return {
    result: outcome.result,
    steps: executedSteps,
    evidence,
    hypotheses: outcome.hypotheses,
    winningHypothesisId: outcome.winningHypothesisId,
    confidence: outcome.confidence,
  };
}

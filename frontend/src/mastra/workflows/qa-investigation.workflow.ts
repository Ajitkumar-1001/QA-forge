import { z } from "zod";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { chromium, type Page } from "playwright";
import {
  createNavigateTool,
  installNavigationGuard,
  getRedirectChain,
  SsrfDeniedError,
} from "../tools/browser/navigate.tool";
import { startSsrfProxy, toLaunchProxyOption } from "../tools/browser/ssrf-proxy";
import { createEvidenceRecorder, createEvidenceTool, redactValue } from "../tools/browser/evidence.tool";
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
import { logEvent } from "../observability";

export function isSupportedVerdict(inputData: { verdict: Verdict }): boolean {
  return inputData.verdict === "SUPPORTED";
}

export function isBudgetExhaustedVerdict(inputData: { verdict: Verdict }): boolean {
  return !isSupportedVerdict(inputData);
}

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

  maxIterations?: number;

  runId: string;
}

export async function runQaInvestigation(input: QaInvestigationInput): Promise<Report> {
  const maxIterations = input.maxIterations ?? 3;
  const proxy = await startSsrfProxy();
  const browser = await chromium.launch({ proxy: toLaunchProxyOption(proxy) });

  const executedSteps: StepEntity[] = [];
  let evidence: Evidence[] = [];
  let allPassed = true;

  try {
    const context = await browser.newContext();
    const navGuard = await installNavigationGuard(context);
    const page = await context.newPage();
    const recorder = createEvidenceRecorder(page, input.credentialValue);

    let lastStatus: number | null = null;
    let lastRedirectChain: string[] = [];
    page.on("response", (response) => {
      if (response.request().frame() === page.mainFrame()) {
        lastStatus = response.status();
        lastRedirectChain = getRedirectChain(response);
      }
    });

    const navigateTool = createNavigateTool(page);
    await navigateTool.execute!({ url: input.applicationUrl }, {} as never);

    for (const plannedStep of input.steps) {
      let observed: string | null = null;
      let status: StepEntity["status"] = "RUNNING";
      logEvent({
        type: "step_start",
        runId: input.runId,
        position: plannedStep.position,
        action: plannedStep.action,
      });

      try {
        await executeStepAction(page, input.applicationUrl, plannedStep.action, input.credentialValue);

        const consoleMessages = recorder.getConsoleMessages().map((message) => message.text);
        const succeeded = await checkCriterion(plannedStep.successCriteria, page, consoleMessages, lastStatus);

        const failureConfirmed =
          !succeeded && (await checkCriterion(plannedStep.failureCriteria, page, consoleMessages, lastStatus));
        status = succeeded ? "PASSED" : "FAILED";

        observed = redactValue(
          succeeded
            ? page.url()
            : failureConfirmed
              ? `${page.url()} (failureCriteria confirmed)`
              : `${page.url()} (successCriteria unmet, failureCriteria also unmet — ambiguous)`,
          input.credentialValue,
        );
      } catch (error) {
        status = "FAILED";

        const blockedUrl = navGuard.consumeBlockedUrl();
        if (blockedUrl) {
          throw new SsrfDeniedError(blockedUrl);
        }

        observed = redactValue(`${(error as Error).message} (at ${page.url()})`, input.credentialValue);
      }

      logEvent({ type: "step_end", runId: input.runId, position: plannedStep.position, status });
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
          redirectChain: lastRedirectChain,
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
    runId: input.runId,
  });
  const workflow = buildInvestigationWorkflow(deps, maxIterations);
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { triedHypotheses: [], searchHistory: [] } });

  if (result.status !== "success") {
    throw new Error(`Investigation workflow did not complete successfully: ${result.status}`);
  }

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

import { Mastra } from '@mastra/core/mastra';
import { testPlannerAgent } from './agents/test-planner.agent';
import { rootCauseAgent } from './agents/root-cause.agent';
import { validatorAgent } from './agents/validator.agent';

/**
 * Registers the three agents whose model/instructions are fixed at module load (test-planner,
 * root-cause, validator). The Browser Execution Agent is NOT here — it's built per-run, bound to
 * that run's live `page` and origin URL (browser-execution.agent.ts). The main investigation
 * workflow (qa-investigation.workflow.ts) is likewise NOT registered as a static instance: its
 * composite loop step needs this run's own repoUrl/objective/GitHub token/evidence — none of
 * which exist until a scenario step has actually failed — so `runQaInvestigation()` builds and
 * commits it fresh per invocation instead (see that file's own comment for the full reasoning).
 */
export const mastra = new Mastra({
  agents: { testPlanner: testPlannerAgent, rootCause: rootCauseAgent, validator: validatorAgent },
  workflows: {},
});

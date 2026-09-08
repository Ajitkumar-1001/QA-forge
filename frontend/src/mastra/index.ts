import { Mastra } from '@mastra/core/mastra';
import { testPlannerAgent } from './agents/test-planner.agent';
import { rootCauseAgent } from './agents/root-cause.agent';
import { validatorAgent } from './agents/validator.agent';

export const mastra = new Mastra({
  agents: { testPlanner: testPlannerAgent, rootCause: rootCauseAgent, validator: validatorAgent },
  workflows: {},
});

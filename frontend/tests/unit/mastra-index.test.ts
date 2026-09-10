import { describe, expect, it } from "vitest";
import { mastra } from "@/mastra";

describe("mastra registry (src/mastra/index.ts)", () => {
  it("registers all 4 agents, including browserExecution", () => {
    expect(mastra.getAgent("testPlanner")).toBeDefined();
    expect(mastra.getAgent("rootCause")).toBeDefined();
    expect(mastra.getAgent("validator")).toBeDefined();
    expect(mastra.getAgent("browserExecution")).toBeDefined();
  });

  it("registers the qaInvestigation workflow", () => {
    expect(mastra.getWorkflow("qaInvestigation")).toBeDefined();
  });
});

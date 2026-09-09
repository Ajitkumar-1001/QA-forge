import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "@/mastra/types";
import type { TestPlan } from "@/mastra/schemas/test-plan.schema";
import { main, handleFatalError } from "@/cli/run";

// Needed by src/lib/crypto.ts (via createScenarioForCaller/resolveCredentialForCaller's
// credentialValue path, 007-cli-credential-parity) — same convention tests/unit/test-scenario.test.ts uses.
process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

// This exercises the DB-touching parts of cli/run.ts (T012-T014's success path and the
// top-level ERROR-catch path) directly, in-process against a mocked pglite DB — the same
// pattern tests/unit/run-persistence.test.ts uses — rather than spawning a real subprocess
// (tests/integration/cli-contract.test.ts already covers the DB-free argv/env contract).

vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db };
});

let mockPlan: TestPlan = {
  plannable: true,
  steps: [
    {
      position: 0,
      action: "Load the homepage",
      expectedOutcome: "Homepage renders",
      successCriteria: { kind: "url", match: "/" },
      failureCriteria: { kind: "consoleAbsent", pattern: "error" },
    },
  ],
};

vi.mock("@/mastra/agents/test-planner.agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mastra/agents/test-planner.agent")>();
  return { ...actual, generateTestPlan: vi.fn(async () => mockPlan) };
});

vi.mock("@/mastra/workflows/qa-investigation.workflow", () => ({
  runQaInvestigation: vi.fn(),
}));

let db: typeof import("@/db/client").db;
let schema: typeof import("@/db/schema");

const ORIGINAL_ARGV = process.argv;
const ORIGINAL_ENV = { ...process.env };

function setArgv(args: string[]): void {
  process.argv = [...ORIGINAL_ARGV.slice(0, 2), ...args];
}

const PASS_REPORT: Report = {
  result: "PASS",
  steps: [
    {
      position: 0,
      action: "Load the homepage",
      expectedOutcome: "Homepage renders",
      successCriteria: { kind: "url", match: "/" },
      failureCriteria: { kind: "consoleAbsent", pattern: "error" },
      observed: "/",
      status: "PASSED",
    },
  ],
  evidence: [],
  hypotheses: [],
  winningHypothesisId: null,
  confidence: null,
};

beforeEach(async () => {
  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");

  await db.delete(schema.testRun);
  await db.delete(schema.testScenario);
  await db.delete(schema.project);
  await db.delete(schema.githubConnection);
  await db.delete(schema.account);
  await db.delete(schema.session);
  await db.delete(schema.user);
  await db.insert(schema.user).values([{ id: "cli-user", name: "CLI User", email: "cli@example.com" }]);

  const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");
  vi.mocked(runQaInvestigation).mockReset().mockResolvedValue(PASS_REPORT);
  mockPlan = {
    plannable: true,
    steps: [
      {
        position: 0,
        action: "Load the homepage",
        expectedOutcome: "Homepage renders",
        successCriteria: { kind: "url", match: "/" },
        failureCriteria: { kind: "consoleAbsent", pattern: "error" },
      },
    ],
  };

  process.env = {
    ...ORIGINAL_ENV,
    ANTHROPIC_API_KEY: "fake-key-for-test",
    QAFORGE_USER_ID: "cli-user",
  };
  delete process.env.QAFORGE_CREDENTIAL;
  setArgv(["--url", "https://example.com", "--repo", "owner/repo", "--objective", "load the homepage"]);
  process.exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = ORIGINAL_ARGV;
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("cli/run.ts main() — durable-write success path (T012-T014, untested before)", () => {
  // Runs first in the file, deliberately: currentRun/recordRunResultForCallerFn are module-
  // level state shared across every test below, and this is the one case that must observe
  // them as never-yet-set rather than stale from a previous test's run.
  it("does not persist anything when the failure happens before a run row exists (e.g. missing user)", async () => {
    delete process.env.QAFORGE_USER_ID;

    await main().catch(handleFatalError);

    expect(process.exitCode).toBe(3);
    expect(await db.query.testRun.findFirst()).toBeUndefined();
  });

  it("creates project/scenario/run rows and records the terminal report, retrievable via getRunForCaller", async () => {
    await main();

    expect(process.exitCode).toBe(0);

    const { getRunForCaller } = await import("@/lib/repositories/test-run");
    const project = await db.query.project.findFirst({ where: (t, { eq }) => eq(t.userId, "cli-user") });
    expect(project).toBeDefined();

    const run = await db.query.testRun.findFirst();
    expect(run?.status).toBe("PASSED");

    const full = await getRunForCaller("cli-user", run!.id);
    expect(full!.report!.result).toBe("PASS");
    expect(full!.steps).toHaveLength(1);
  });

  it("007-cli-credential-parity: a supplied QAFORGE_CREDENTIAL is stored via the real encrypted store and resolved back before the investigation, not the old unresolvable marker string", async () => {
    process.env.QAFORGE_CREDENTIAL = JSON.stringify({ username: "cli-e2e-user", password: "hunter2-cli-secret" });

    await main();

    expect(process.exitCode).toBe(0);

    const scenario = await db.query.testScenario.findFirst();
    expect(scenario!.credentialsReference).not.toBeNull();
    expect(scenario!.credentialsReference).not.toBe("cli-env:QAFORGE_CREDENTIAL"); // the old marker

    const credentialRow = await db.query.credential.findFirst({
      where: (t, { eq }) => eq(t.id, scenario!.credentialsReference!),
    });
    expect(credentialRow).toBeDefined();
    expect(credentialRow!.encryptedValue).not.toContain("hunter2-cli-secret");

    const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");
    expect(vi.mocked(runQaInvestigation)).toHaveBeenCalledWith(expect.objectContaining({ credentialValue: "hunter2-cli-secret" }));
  });

  it("persists a FAILED run with its hypotheses when the investigation fails", async () => {
    const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");
    vi.mocked(runQaInvestigation).mockResolvedValue({
      result: "FAIL",
      steps: [],
      evidence: [{ id: "ev-1", stepId: null, type: "CONSOLE", content: "boom", metadata: {} }],
      hypotheses: [
        {
          id: "hyp-1",
          status: "SUPPORTED",
          description: "root cause",
          confidence: 0.8,
          evidenceLinks: [{ evidenceRef: "ev-1", role: "SUPPORTING" }],
          checks: [],
        },
      ],
      winningHypothesisId: "hyp-1",
      confidence: 0.8,
    });

    await main();

    expect(process.exitCode).toBe(1);
    const run = await db.query.testRun.findFirst();
    expect(run?.status).toBe("FAILED");
    const report = await db.query.report.findFirst({ where: (t, { eq }) => eq(t.runId, run!.id) });
    expect(report?.winningHypothesisId).toBe("hyp-1");
  });
});

describe("cli/run.ts main().catch(handleFatalError) — ERROR-catch persistence path (untested before)", () => {
  it("persists status=ERROR with the classified errorReason when the plan is unplannable", async () => {
    mockPlan = { plannable: false, reason: "objective is not decomposable into browser steps" };

    await main().catch(handleFatalError);

    expect(process.exitCode).toBe(3);
    const run = await db.query.testRun.findFirst();
    expect(run).toBeDefined(); // touch point 1 already created it, in PLANNING, before the throw
    expect(run?.status).toBe("ERROR");
    expect(run?.errorReason).toBe("OBJECTIVE_NOT_PLANNABLE");
  });

  it("stores errorReason as null for an unrecognized reason instead of misattributing it", async () => {
    const { runQaInvestigation } = await import("@/mastra/workflows/qa-investigation.workflow");
    vi.mocked(runQaInvestigation).mockRejectedValue(
      Object.assign(new Error("something the CLI doesn't classify"), { reason: "SOME_UNMAPPED_REASON" }),
    );

    await main().catch(handleFatalError);

    expect(process.exitCode).toBe(3);
    const run = await db.query.testRun.findFirst();
    expect(run?.status).toBe("ERROR");
    expect(run?.errorReason).toBeNull();
  });
});

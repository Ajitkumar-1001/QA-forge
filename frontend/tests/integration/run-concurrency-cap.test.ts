import { describe, expect, it, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { TestRun } from "@/db/schema";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(import.meta.dirname, "../../src/cli/run.ts");

// This file needs a genuinely live Postgres — unlike every other Vitest test in this repo,
// nothing here mocks @/db/client. PGlite (used everywhere else) is single-connection/
// embedded and cannot exercise real concurrent-transaction contention — the exact property
// US3 needs proven (research.md Decision 2, empirically verified there via a direct psql
// probe before this test existed). Skipped cleanly, not failing the suite, when
// DATABASE_URL isn't set at all — mirrors tests/e2e/auth-flow.live.e2e.ts's "needs a real
// environment" skip pattern (plan.md's Testing section).
//
// The gate check itself must not import anything that imports @/db/client — that module
// throws synchronously at import time when DATABASE_URL is unset (src/db/client.ts), which
// would defeat a clean skip. Every DB-touching import below is therefore dynamic, inside
// the gated describe block, never at this file's top level.
const HAS_REAL_DB = !!process.env.DATABASE_URL;

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], env: Record<string, string>): Promise<CliResult> {
  try {
    const result = await execFileAsync("node", ["--import", "tsx", CLI_PATH, ...args], {
      env: { ...process.env, ...env },
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout, stderr: e.stderr, exitCode: e.code };
  }
}

describe.skipIf(!HAS_REAL_DB)("006-run-concurrency-cap — real-Postgres proof (needs DATABASE_URL)", () => {
  let db: typeof import("@/db/client").db;
  let schema: typeof import("@/db/schema");
  let startRunForCaller: typeof import("@/lib/repositories/test-run").startRunForCaller;

  beforeEach(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ startRunForCaller } = await import("@/lib/repositories/test-run"));
  });

  // Real, unique-per-test data (not shared fixtures) — this file may run alongside other
  // real-DB work (e.g. Playwright's dev server) against the same database, so nothing here
  // assumes it owns the whole table.
  async function seedCapUser(nonTerminalCount: number) {
    const userId = `cap-race-${crypto.randomUUID()}`;
    await db.insert(schema.user).values({ id: userId, name: "Cap Race User", email: `${userId}@example.com` });
    const [proj] = await db
      .insert(schema.project)
      .values({ id: crypto.randomUUID(), userId, applicationUrl: "https://example.com", repository: "owner/repo" })
      .returning();
    const [scenario] = await db
      .insert(schema.testScenario)
      .values({ id: crypto.randomUUID(), projectId: proj!.id, objective: "006-run-concurrency-cap real-DB proof" })
      .returning();
    if (nonTerminalCount > 0) {
      await db.insert(schema.testRun).values(
        Array.from({ length: nonTerminalCount }, (_, i) => ({
          id: crypto.randomUUID(),
          scenarioId: scenario!.id,
          idempotencyKey: `seed-${i}-${crypto.randomUUID()}`,
          status: "RUNNING" as const,
          startedAt: new Date(),
        })),
      );
    }
    return { userId, scenarioId: scenario!.id };
  }

  describe("US3 — race-freedom under real concurrent requests (FR-003, SC-004)", () => {
    it("exactly one of 3 simultaneous requests succeeds when the user is at 4 non-terminal runs", async () => {
      const { userId, scenarioId } = await seedCapUser(4);

      const results = await Promise.all(
        Array.from({ length: 3 }, (_, i) => startRunForCaller(userId, { scenarioId, idempotencyKey: `race-${i}-${crypto.randomUUID()}` })),
      );

      const succeeded = results.filter((r): r is { run: TestRun; created: boolean } => "run" in r);
      const rejected = results.filter((r): r is { ok: false; reason: "not_found_or_not_owned" | "RATE_LIMITED" } => "ok" in r);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      expect(rejected.every((r) => r.reason === "RATE_LIMITED")).toBe(true);

      const allRuns = await db.query.testRun.findMany({ where: (t, { eq }) => eq(t.scenarioId, scenarioId) });
      const nonTerminal = allRuns.filter((r) => r.status !== "PASSED" && r.status !== "FAILED" && r.status !== "ERROR");
      expect(nonTerminal).toHaveLength(5); // never 6, never 7 — the race genuinely closed
    });

    it("every simultaneous request is rejected when already at exactly 5 non-terminal runs", async () => {
      const { userId, scenarioId } = await seedCapUser(5);

      const results = await Promise.all(
        Array.from({ length: 3 }, (_, i) => startRunForCaller(userId, { scenarioId, idempotencyKey: `race-full-${i}-${crypto.randomUUID()}` })),
      );

      expect(results.every((r) => "ok" in r && r.reason === "RATE_LIMITED")).toBe(true);
    });
  });

  describe("US2 — the CLI surfaces the identical limit (FR-005, FR-006)", () => {
    it(
      "exits non-zero with a limit-specific message, and creates no new row, when the CLI's user is at the cap",
      async () => {
        const { userId } = await seedCapUser(5);

        const result = await runCli(["--url", "https://example.com", "--repo", "owner/repo", "--objective", "test"], {
          ANTHROPIC_API_KEY: "fake-key-for-cap-test-only",
          QAFORGE_USER_ID: userId,
        });

        expect(result.exitCode).toBe(3);
        expect(result.stderr).toContain("RATE_LIMITED");

        // Only the one project seedCapUser created for this user exists — the CLI's own
        // attempt never got as far as creating a second one (the pre-check, T006).
        const projects = await db.query.project.findMany({ where: (t, { eq }) => eq(t.userId, userId) });
        expect(projects).toHaveLength(1);
      },
      // A real subprocess (tsx-transformed, cold) + a real Postgres connection legitimately
      // takes longer than Vitest's 5s default — observed ~5.1s, just over it.
      15_000,
    );
  });
});

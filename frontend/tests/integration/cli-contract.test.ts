import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(import.meta.dirname, "../../src/cli/run.ts");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
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

/**
 * The CLI's exit-code contract (contracts/cli-contract.md), spawned end-to-end as a real child
 * process. Covers exit 3's two paths reachable without a real LLM call: missing arguments and a
 * missing `ANTHROPIC_API_KEY` — both must fire before any browser/repo work starts, per the
 * contract's own text. Exit codes 0/1/2 need a real `generateTestPlan()` call (Anthropic), which
 * this environment has no API key for — those are exercised instead by `runQaInvestigation()`'s
 * own in-process integration tests (T030/T041/T043 in `qa-investigation.workflow.test.ts`), which
 * verify the same `Report`→exit-code mapping (`exitCodeForResult` in `run.ts`) without needing a
 * live provider call. Spawning still proves what only a real process boundary can: `--format
 * json`'s stdout carries *only* the JSON object, and the reason is duplicated onto stderr.
 */
describe("CLI exit-code contract (contracts/cli-contract.md)", () => {
  it("exits 3 with INVALID_ARGUMENT when required flags are missing", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("INVALID_ARGUMENT");
  });

  it("exits 3 with MISSING_API_KEY when ANTHROPIC_API_KEY is unset", async () => {
    const result = await runCli(
      ["--url", "https://example.com", "--repo", "owner/repo", "--objective", "test"],
      { ANTHROPIC_API_KEY: "" },
    );
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("MISSING_API_KEY");
  });

  it("--format json emits only the error object on stdout, with the reason also on stderr", async () => {
    const result = await runCli(
      [
        "--url", "https://example.com",
        "--repo", "owner/repo",
        "--objective", "test",
        "--format", "json",
      ],
      { ANTHROPIC_API_KEY: "" },
    );
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("MISSING_API_KEY");
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toEqual({
      error: { reason: "MISSING_API_KEY", message: "ANTHROPIC_API_KEY is not set" },
    });
  });

  it("--format json emits the same {error:{reason,message}} shape for a usage error", async () => {
    const result = await runCli(["--format", "json"]);
    expect(result.exitCode).toBe(3);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.error.reason).toBe("INVALID_ARGUMENT");
    expect(typeof parsed.error.message).toBe("string");
  });

  it("rejects malformed QAFORGE_CREDENTIAL before any browser/repo work starts", async () => {
    const result = await runCli(
      ["--url", "https://example.com", "--repo", "owner/repo", "--objective", "test"],
      { ANTHROPIC_API_KEY: "fake-key-for-cli-arg-validation-only", QAFORGE_CREDENTIAL: "not valid json" },
    );
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("INVALID_ARGUMENT");
  });
});

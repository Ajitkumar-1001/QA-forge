#!/usr/bin/env node

/**
 * CLI entrypoint (contracts/cli-contract.md). This is the skeleton (T018): argument parsing, env
 * var reads, and the top-level error-to-exit-code mapping. T040 wires in the actual workflow
 * invocation and Report printing.
 */

type OutputFormat = "text" | "json";

function detectFormat(argv: string[]): OutputFormat {
  const index = argv.indexOf("--format");
  return index !== -1 && argv[index + 1] === "json" ? "json" : "text";
}

interface ParsedArgs {
  url: string;
  repo: string;
  objective: string;
  format: OutputFormat;
  maxSteps?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token?.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined) {
        throw Object.assign(new Error(`Missing value for --${key}`), { reason: "INVALID_ARGUMENT" });
      }
      flags[key] = value;
      i++;
    }
  }

  if (!flags.url || !flags.repo || !flags.objective) {
    throw Object.assign(
      new Error(
        'Usage: qaforge --url <url> --repo <owner/repo> --objective "<objective>" [--format text|json] [--max-steps <n>]',
      ),
      { reason: "INVALID_ARGUMENT" },
    );
  }

  return {
    url: flags.url,
    repo: flags.repo,
    objective: flags.objective,
    format: flags.format === "json" ? "json" : "text",
    maxSteps: flags["max-steps"] ? Number(flags["max-steps"]) : undefined,
  };
}

function reportError(format: OutputFormat, reason: string, message: string): void {
  // Always also on stderr, so a truncated/piped stdout doesn't lose it (contracts/cli-contract.md).
  process.stderr.write(`${reason}: ${message}\n`);
  if (format === "json") {
    console.log(JSON.stringify({ error: { reason, message } }));
  } else {
    console.log(`QAFORGE ERROR (${reason}): ${message}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not set"), { reason: "MISSING_API_KEY" });
  }

  // GITHUB_TOKEN (optional) — consumed via GIT_ASKPASS by the repository investigator (T032).
  // QAFORGE_CREDENTIAL (optional, JSON string) — consumed once by the login step (T031/T015),
  // never logged, never stored on the Run object (FR-006, Constitution Principle IV). Read here
  // only far enough to fail fast on malformed input; the values themselves flow to their
  // consumers directly, not through a variable this file otherwise holds onto.
  const credentialJson = process.env.QAFORGE_CREDENTIAL;
  if (credentialJson) {
    try {
      JSON.parse(credentialJson);
    } catch {
      throw Object.assign(new Error("QAFORGE_CREDENTIAL is not valid JSON"), {
        reason: "INVALID_ARGUMENT",
      });
    }
  }

  // T040 wires the actual workflow invocation and Report printing here.
  void args;
  throw Object.assign(new Error("qaforge: workflow not yet wired"), {
    reason: "OBJECTIVE_NOT_PLANNABLE",
  });
}

main().catch((error: unknown) => {
  const format = detectFormat(process.argv.slice(2));
  const reason = (error as { reason?: string })?.reason ?? "UNKNOWN_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  reportError(format, reason, message);
  process.exitCode = 3;
});

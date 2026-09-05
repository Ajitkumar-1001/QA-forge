import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";

const execFileAsync = promisify(execFile);

export interface CandidateFile {
  path: string;
  /** 0.0–1.0, the relevance score against the observed failure (PRD §9.5). */
  relevance: number;
  excerpt: string;
}

/** PRD §9.5's minimum relevance bar — empty result over a weak guess (Constitution Principle I). */
export const RELEVANCE_FLOOR = 0.4;

/**
 * Omits any candidate that doesn't clear the relevance floor, rather than including a weak guess
 * (FR-007). A run with zero qualifying candidates returns an empty array — the caller must still
 * be able to produce hypotheses from runtime evidence alone.
 */
export function filterByRelevanceFloor(candidates: CandidateFile[]): CandidateFile[] {
  return candidates.filter((candidate) => candidate.relevance >= RELEVANCE_FLOOR);
}

const TEXT_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".java",
  ".rs", ".php", ".json", ".md", ".yml", ".yaml", ".html", ".css",
]);
/** Named but not tuned (spec.md Assumptions — resource bounds beyond step count, deferred). */
const MAX_FILES_SCANNED = 500;

/**
 * `GIT_ASKPASS` script that reads the token from its own environment at invocation time — the
 * script FILE never contains the secret, and the token never appears in `git`'s argv or
 * `.git/config` (research.md §6, Constitution Principle IV).
 */
async function writeAskPassScript(): Promise<{ scriptPath: string; scriptDir: string }> {
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "qaforge-askpass-"));
  const scriptPath = path.join(scriptDir, "askpass.sh");
  await fsp.writeFile(scriptPath, '#!/bin/sh\necho "$GITHUB_TOKEN"\n', { mode: 0o700 });
  return { scriptPath, scriptDir };
}

async function cloneRepository(
  repoUrl: string,
  githubToken?: string,
): Promise<{ cloneDir: string; cleanup: () => Promise<void> }> {
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), "qaforge-repo-"));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  let askPassDir: string | undefined;

  if (githubToken) {
    const { scriptPath, scriptDir } = await writeAskPassScript();
    env.GIT_ASKPASS = scriptPath;
    env.GITHUB_TOKEN = githubToken;
    askPassDir = scriptDir;
  }

  try {
    await execFileAsync("git", ["clone", "--depth", "1", repoUrl, cloneDir], { env });
  } catch (error) {
    await fsp.rm(cloneDir, { recursive: true, force: true });
    if (askPassDir) await fsp.rm(askPassDir, { recursive: true, force: true });
    throw Object.assign(
      new Error(`REPO_ACCESS_DENIED: could not clone ${repoUrl} — ${(error as Error).message}`),
      { reason: "REPO_ACCESS_DENIED" as const },
    );
  }

  return {
    cloneDir,
    cleanup: async () => {
      await fsp.rm(cloneDir, { recursive: true, force: true });
      if (askPassDir) await fsp.rm(askPassDir, { recursive: true, force: true });
    },
  };
}

async function listTextFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    if (results.length >= MAX_FILES_SCANNED) return;
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= MAX_FILES_SCANNED) return;
      if (entry.name === ".git") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results;
}

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length >= 4)),
  );
}

/** Deterministic, code-decided relevance score (Constitution Principle I) — the fraction of
 * search keywords a file's content contains. Not an LLM judgment call. */
function scoreRelevance(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lowerContent = content.toLowerCase();
  const matches = keywords.filter((keyword) => lowerContent.includes(keyword)).length;
  return matches / keywords.length;
}

const investigateInputSchema = z.object({
  repoUrl: z.string(),
  searchText: z.string(),
  searchHistory: z.array(z.string()).default([]),
});

/**
 * Repository Investigator tool (FR-007, SEC-003, SEC-004, research.md §6): `GIT_ASKPASS`-
 * authenticated shallow clone into an `fs.mkdtempSync()` temp dir, keyword-scored search, the
 * 0.4 relevance floor, self-delete in `finally` regardless of outcome — no write path exists
 * anywhere in this function (SEC-003). Consumes `searchHistory` (already-used keywords) so a
 * later investigation round narrows its search rather than repeating it.
 */
export function createInvestigateTool(githubToken?: string) {
  return createTool({
    id: "investigate-repository",
    description:
      "Search the connected repository for source files relevant to the observed failure.",
    inputSchema: investigateInputSchema,
    execute: async ({ repoUrl, searchText, searchHistory }) => {
      const { cloneDir, cleanup } = await cloneRepository(repoUrl, githubToken);
      try {
        const keywords = extractKeywords(searchText).filter((word) => !searchHistory.includes(word));
        const files = await listTextFiles(cloneDir);
        const candidates: CandidateFile[] = [];
        for (const filePath of files) {
          const content = await fsp.readFile(filePath, "utf-8").catch(() => "");
          const relevance = scoreRelevance(content, keywords);
          if (relevance > 0) {
            candidates.push({
              path: path.relative(cloneDir, filePath),
              relevance,
              excerpt: content.slice(0, 500),
            });
          }
        }
        const qualifying = filterByRelevanceFloor(candidates).sort(
          (a, b) => b.relevance - a.relevance,
        );
        return {
          candidateFiles: qualifying,
          searchHistory: [...searchHistory, ...keywords],
        };
      } finally {
        await cleanup();
      }
    },
  });
}

// 007-github-connection: the first REST call this codebase makes to GitHub — 001's own
// repo-investigation tool authenticates via `git clone` + GIT_ASKPASS, not this API
// (verified by reading it before writing this file; research.md Decision 1). No Octokit —
// nothing in this codebase uses it, and two raw fetch calls don't need an SDK's weight.

export type GithubApiResult =
  | { ok: true; repositories: string[] }
  | { ok: false; reason: "INVALID_TOKEN" | "GITHUB_UNREACHABLE" };

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Verifies a personal access token authenticates for real, then lists the repositories it
 * can see. Cannot confirm the token holds the exact D13 permissions (Contents: Read-only +
 * Issues: Read-and-write) — verified against GitHub's own REST API docs that no endpoint or
 * header exposes a fine-grained PAT's granted permissions ahead of use (research.md Decision
 * 1). This only confirms the token is valid and can read repository data.
 */
export async function verifyAndListGithubRepositories(pat: string): Promise<GithubApiResult> {
  // e2e-only test seam (tests/e2e/settings.e2e.ts): a real connect/repositories-view calls
  // the real GitHub API twice — a real external dependency and, for /user/repos, real user
  // data, neither appropriate for an automated CI run. Same pattern as actions.ts's
  // QAFORGE_E2E_FAKE_REPORT (005/006) — set only by that test's own dev-server environment;
  // unset in every real deployment, where this branch never runs.
  if (process.env.QAFORGE_E2E_FAKE_GITHUB_API) {
    return JSON.parse(process.env.QAFORGE_E2E_FAKE_GITHUB_API) as GithubApiResult;
  }

  let userResponse: Response;
  try {
    userResponse = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    });
  } catch {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  if (userResponse.status === 401) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (!userResponse.ok) {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  let reposResponse: Response;
  try {
    reposResponse = await fetch(`${GITHUB_API_BASE}/user/repos`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    });
  } catch {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  if (reposResponse.status === 401) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (!reposResponse.ok) {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  // Attack pass finding: a 200 with malformed JSON (a GitHub-side outage class, not caused
  // by anything the caller did) would otherwise throw uncaught here — surfaced as
  // GITHUB_UNREACHABLE, the same "something's wrong on GitHub's end" bucket a real
  // connection failure already lands in, not a crash.
  let repos: Array<{ full_name: string }>;
  try {
    repos = (await reposResponse.json()) as Array<{ full_name: string }>;
  } catch {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }
  return { ok: true, repositories: repos.map((r) => r.full_name) };
}

// D9/GitHub-Write-Path: the one external write QAForge makes (Constitution V). Creates a
// real issue via `POST /repos/{owner}/{repo}/issues` — confirmed against GitHub's own REST
// docs that this endpoint needs the Issues:write fine-grained permission D13 already
// requests, and that a 201 response's `html_url` is the field to persist. Every distinct
// failure (400/403/404/410/422/503, a network error, or malformed JSON) collapses into the
// same two-reason bucket verifyAndListGithubRepositories already uses above — nothing in
// approval.ts's caller differentiates them any further than "worked" vs "didn't."
export async function createGithubIssue(
  pat: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<{ ok: true; htmlUrl: string } | { ok: false; reason: "INVALID_TOKEN" | "GITHUB_UNREACHABLE" }> {
  if (process.env.QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL) {
    return { ok: true, htmlUrl: process.env.QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL };
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body }),
    });
  } catch {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  if (response.status === 401) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (response.status !== 201) {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }

  let created: { html_url: string };
  try {
    created = (await response.json()) as { html_url: string };
  } catch {
    return { ok: false, reason: "GITHUB_UNREACHABLE" };
  }
  return { ok: true, htmlUrl: created.html_url };
}

// D9/GitHub-Write-Path: the duplicate-issue safety net approval.approve runs before ever
// creating (PRD §15 — a "narrows, does not eliminate" mitigation, not a solved guarantee).
// Uses GET /repos/{owner}/{repo}/issues (list + client-side filter), not the Search Issues
// API (GET /search/issues): the fine-grained-PAT permissions table for Issues explicitly
// covers this list endpoint under the same Issues:read D13 already grants, while Search
// isn't listed there at all (verified against GitHub's own REST docs); listing also has no
// index-consistency lag, which sidesteps the exact "GitHub's search index not yet
// consistent" known-limitation the PRD names for whichever check ships. Not paginated
// beyond one page (100, newest first) — the only real race this guards is a very recent
// retry, not an exhaustive historical audit.
export async function findExistingApprovalIssue(pat: string, owner: string, repo: string, marker: string): Promise<
  | { found: true; htmlUrl: string }
  | { found: false }
  | { found: null; reason: "INVALID_TOKEN" | "GITHUB_UNREACHABLE" }
> {
  if (process.env.QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL) {
    return { found: false };
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    });
  } catch {
    return { found: null, reason: "GITHUB_UNREACHABLE" };
  }

  if (response.status === 401) {
    return { found: null, reason: "INVALID_TOKEN" };
  }
  if (!response.ok) {
    return { found: null, reason: "GITHUB_UNREACHABLE" };
  }

  let issues: Array<{ body: string | null; html_url: string }>;
  try {
    issues = (await response.json()) as Array<{ body: string | null; html_url: string }>;
  } catch {
    return { found: null, reason: "GITHUB_UNREACHABLE" };
  }

  const match = issues.find((issue) => issue.body?.includes(marker));
  return match ? { found: true, htmlUrl: match.html_url } : { found: false };
}

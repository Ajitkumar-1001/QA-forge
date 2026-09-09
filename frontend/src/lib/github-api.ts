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

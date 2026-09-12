// 008-slack-linear-integrations: no SDK — matches github-api.ts's own precedent of raw
// fetch over an SDK's weight. Query/mutation shapes confirmed against Linear's live
// production schema (research.md Decision 3) — Query.issues' args, PaginationOrderBy's
// enum values, and IssueFilter.description's NullableStringComparator (contains) were all
// verified via a live introspection call against api.linear.app/graphql, not assumed from
// docs alone. One thing that verification could NOT confirm from any of four independent
// sources: which direction orderBy:createdAt traverses (the schema has no separate
// ascending/descending argument at all) — see research.md Decision 3's open risk and
// tasks.md T013, blocked in this environment on not having a real Linear API key to run the
// one settling call with.

const LINEAR_API_BASE = "https://api.linear.app/graphql";

// Linear's personal API keys go in Authorization directly, no "Bearer " prefix — Linear's
// own documented convention, distinct from OAuth access tokens (which do use Bearer).
function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: apiKey, "Content-Type": "application/json" };
}

interface LinearGraphqlError {
  message: string;
  extensions?: { code?: string };
}

async function postGraphql(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; reason: "INVALID_KEY" | "LINEAR_UNREACHABLE" }> {
  let response: Response;
  try {
    response = await fetch(LINEAR_API_BASE, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "LINEAR_UNREACHABLE" };
  }

  if (!response.ok) {
    return { ok: false, reason: "LINEAR_UNREACHABLE" };
  }

  let body: { data?: unknown; errors?: LinearGraphqlError[] };
  try {
    body = (await response.json()) as { data?: unknown; errors?: LinearGraphqlError[] };
  } catch {
    return { ok: false, reason: "LINEAR_UNREACHABLE" };
  }

  if (body.errors?.length) {
    const isAuthError = body.errors.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR");
    return { ok: false, reason: isAuthError ? "INVALID_KEY" : "LINEAR_UNREACHABLE" };
  }
  return { ok: true, data: body.data };
}

// FR-013: non-recoverable (invalid/revoked credential) distinguished from recoverable
// (timeout/unreachable). Lives here, not in the "use server" actions file, so both the
// ephemeral action-response banner and approval-view.tsx's persisted-state render (reading
// the stored linear_issue_error column) share one copy of this mapping — "use server" files
// may only export async functions, so this plain one couldn't live there anyway.
export function linearNoticeForFailure(underlyingReason: "INVALID_KEY" | "LINEAR_UNREACHABLE"): { message: string; retryable: boolean } {
  if (underlyingReason === "INVALID_KEY") {
    return { message: "Linear issue could not be created — your Linear key looks invalid or revoked. Reconnect in Settings.", retryable: false };
  }
  return { message: "Linear issue could not be created — Linear didn't respond in time.", retryable: true };
}

export type LinearApiResult =
  | { ok: true; teams: { id: string; name: string }[] }
  | { ok: false; reason: "INVALID_KEY" | "LINEAR_UNREACHABLE" };

export async function verifyAndListLinearTeams(apiKey: string): Promise<LinearApiResult> {
  // e2e-only test seam (tests/e2e/settings.e2e.ts, approval.e2e.ts) — same pattern as
  // QAFORGE_E2E_FAKE_GITHUB_API in github-api.ts.
  if (process.env.QAFORGE_E2E_FAKE_LINEAR_API) {
    return JSON.parse(process.env.QAFORGE_E2E_FAKE_LINEAR_API) as LinearApiResult;
  }

  const result = await postGraphql(apiKey, "query { teams { nodes { id name } } }", {});
  if (!result.ok) return result;

  const data = result.data as { teams?: { nodes?: { id: string; name: string }[] } } | undefined;
  return { ok: true, teams: data?.teams?.nodes ?? [] };
}

export async function createLinearIssue(
  apiKey: string,
  teamId: string,
  title: string,
  body: string,
): Promise<{ ok: true; issueUrl: string } | { ok: false; reason: "INVALID_KEY" | "LINEAR_UNREACHABLE" }> {
  // e2e-only test seam, same pattern as QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL in github-api.ts.
  if (process.env.QAFORGE_E2E_FAKE_LINEAR_ISSUE_URL) {
    return { ok: true, issueUrl: process.env.QAFORGE_E2E_FAKE_LINEAR_ISSUE_URL };
  }

  const mutation = `
    mutation($teamId: String!, $title: String!, $description: String!) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        success
        issue { url }
      }
    }
  `;
  const result = await postGraphql(apiKey, mutation, { teamId, title, description: body });
  if (!result.ok) return result;

  const data = result.data as { issueCreate?: { success: boolean; issue: { url: string } | null } } | undefined;
  if (!data?.issueCreate?.success || !data.issueCreate.issue) {
    return { ok: false, reason: "LINEAR_UNREACHABLE" };
  }
  return { ok: true, issueUrl: data.issueCreate.issue.url };
}

/**
 * D9/GitHub-Write-Path mirror: findExistingApprovalIssue's exact shape, applied to Linear
 * (research.md Decision 3/Decision Log #9) — capped at the 100 most recently created
 * matches, same "narrows, does not eliminate" mitigation, not a solved guarantee.
 */
export async function findExistingLinearIssue(
  apiKey: string,
  teamId: string,
  marker: string,
): Promise<{ found: true; issueUrl: string } | { found: false } | { found: null; reason: "INVALID_KEY" | "LINEAR_UNREACHABLE" }> {
  // e2e-only test seam — matches findExistingApprovalIssue's own precedent: under the fake
  // issue-url seam, the real duplicate-search isn't needed, so this short-circuits to
  // found:false rather than making a real call.
  if (process.env.QAFORGE_E2E_FAKE_LINEAR_ISSUE_URL) {
    return { found: false };
  }

  const query = `
    query($teamId: ID!, $marker: String!) {
      issues(first: 100, orderBy: createdAt, filter: { team: { id: { eq: $teamId } }, description: { contains: $marker } }) {
        nodes { id url }
      }
    }
  `;
  const result = await postGraphql(apiKey, query, { teamId, marker });
  if (!result.ok) return { found: null, reason: result.reason };

  const data = result.data as { issues?: { nodes?: { id: string; url: string }[] } } | undefined;
  const match = data?.issues?.nodes?.[0];
  return match ? { found: true, issueUrl: match.url } : { found: false };
}

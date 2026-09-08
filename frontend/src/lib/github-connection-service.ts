import type { GithubConnection } from "@/db/schema";
import { getCallerId } from "@/lib/auth";
import { withFailClosed } from "@/lib/fail-closed";
import { auditLog } from "@/lib/audit-log";
import { getGithubConnectionForCaller } from "@/lib/repositories/github-connection";

export type ScopedQueryOutcome<T> =
  | { status: "unauthenticated" }
  | { status: "denied" }
  | { status: "error" }
  | { status: "ok"; data: T };

/**
 * Composes FR-015's session resolution + the repository's scoped query + SEC-006's fail-closed
 * handling + SEC-007's audit logging into the one call a future tRPC procedure would actually
 * make. Deliberately NOT in src/lib/repositories/ — SEC-009's CI rule scopes that directory to
 * pure `callerId`-scoped query methods only (contracts/ownership-convention.md), and this is a
 * composition above one, not a scoped query itself. Also deliberately not the tRPC middleware
 * itself — FR-015 explicitly leaves wiring `getCallerId()` into `ctx` to the separate
 * tRPC-Control-Plane feature; this is what that feature's procedure body would call.
 */
export async function getGithubConnectionForCallerSafely(
  headers: Headers,
): Promise<ScopedQueryOutcome<GithubConnection | null>> {
  // FR-005: resolve the caller before any ownership check, as its own, separate step.
  // getCallerId() is already fail-closed (SEC-006) — null covers both "no session" and "session
  // resolution errored," identically, since neither leaves a caller to scope a query against.
  const callerId = await getCallerId(headers);
  if (!callerId) return { status: "unauthenticated" };

  const result = await withFailClosed(() => getGithubConnectionForCaller(callerId));
  if (result.status === "error") {
    auditLog({ type: "scoped_query", userId: callerId, resourceType: "GithubConnection", outcome: "error" });
    return { status: "error" };
  }
  if (result.data === null) {
    // FR-009: identical outcome whether no row exists or one exists for someone else — the log
    // entry can't and doesn't distinguish them either (SEC-007).
    auditLog({ type: "scoped_query", userId: callerId, resourceType: "GithubConnection", outcome: "not_found_or_not_owned" });
    return { status: "denied" };
  }
  return { status: "ok", data: result.data };
}

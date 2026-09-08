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

export async function getGithubConnectionForCallerSafely(
  headers: Headers,
): Promise<ScopedQueryOutcome<GithubConnection | null>> {

  const callerId = await getCallerId(headers);
  if (!callerId) return { status: "unauthenticated" };

  const result = await withFailClosed(() => getGithubConnectionForCaller(callerId));
  if (result.status === "error") {
    auditLog({ type: "scoped_query", userId: callerId, resourceType: "GithubConnection", outcome: "error" });
    return { status: "error" };
  }
  if (result.data === null) {

    auditLog({ type: "scoped_query", userId: callerId, resourceType: "GithubConnection", outcome: "not_found_or_not_owned" });
    return { status: "denied" };
  }
  return { status: "ok", data: result.data };
}

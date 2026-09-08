// SEC-006: any infrastructure error while executing a `callerId`-scoped query MUST be treated as
// denied for that request only — never as authenticated, never as "the resource doesn't exist"
// (a different, definite outcome FR-009 already covers), and never by mutating the Session row
// as a side effect (this function touches nothing but its own try/catch — no session access here
// at all, so there's nothing for it to accidentally mutate).
//
// This is deliberately a generic error-boundary, not a shared ownership-check helper — FR-013
// already rejected building one of those (contracts/ownership-convention.md's "What this
// replaces"). The distinction: an ownership-check helper would decide *whether a caller owns a
// resource*; this only decides *whether the query that answers that question completed at all*.
// Every repository method still writes and owns its own scoped query (FR-006–FR-008); this only
// wraps the outcome.
export type FailClosedOutcome<T> = { status: "ok"; data: T } | { status: "error" };

export async function withFailClosed<T>(fn: () => Promise<T>): Promise<FailClosedOutcome<T>> {
  try {
    return { status: "ok", data: await fn() };
  } catch {
    return { status: "error" };
  }
}

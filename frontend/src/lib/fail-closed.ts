export type FailClosedOutcome<T> = { status: "ok"; data: T } | { status: "error" };

export async function withFailClosed<T>(fn: () => Promise<T>): Promise<FailClosedOutcome<T>> {
  try {
    return { status: "ok", data: await fn() };
  } catch {
    return { status: "error" };
  }
}

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { githubConnection, type GithubConnection } from "@/db/schema";

/**
 * FR-006, FR-009, FR-012, FR-013's worked example — the `callerId`-scoped-query convention
 * (contracts/ownership-convention.md) every later repository method follows: `callerId` as the
 * literal first parameter, one atomic scoped statement, `null` identically whether no row exists
 * at all or a row exists for someone else. No shared check-then-act helper — the query itself
 * scopes ownership, so there's nothing else to build per method.
 *
 * This file holds only this shape (SEC-009's CI rule enforces it structurally) — the
 * session-resolution + fail-closed + audit-logging composition around it lives in
 * src/lib/github-connection-service.ts, since that's a caller-facing composition above a scoped
 * query, not a scoped query itself.
 */
export async function getGithubConnectionForCaller(callerId: string): Promise<GithubConnection | null> {
  const row = await db.query.githubConnection.findFirst({
    where: eq(githubConnection.userId, callerId),
  });
  return row ?? null;
}

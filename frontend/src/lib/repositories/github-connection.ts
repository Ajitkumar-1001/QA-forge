import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { githubConnection, type GithubConnection } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

export async function getGithubConnectionForCaller(callerId: string): Promise<GithubConnection | null> {
  const row = await db.query.githubConnection.findFirst({
    where: eq(githubConnection.userId, callerId),
  });
  return row ?? null;
}

/**
 * 009-wire-github-connection: resolves the caller's own connected token for real use (an
 * investigation's repo clone), not a display value — mirrors resolveCredentialForCaller's
 * (005) exact shape: `undefined` for "no connection", not an error, since the design this
 * function serves treats "not connected" as "proceed without a token" (works for public
 * repos, REPO_ACCESS_DENIED still fires naturally for private ones), not a hard failure.
 * Called once per run, immediately before runQaInvestigation — never cached.
 */
export async function resolveGithubTokenForCaller(callerId: string): Promise<string | undefined> {
  const connection = await getGithubConnectionForCaller(callerId);
  return connection ? decrypt(connection.patReference) : undefined;
}

/**
 * 007-github-connection: takes the plaintext PAT and encrypts it here, inside the repository
 * layer — matches 005's createScenarioForCaller precedent exactly, so Constitution IV's
 * responsibility lives in one place, not split between this function and its caller.
 *
 * One statement handles both "no connection yet" and "replace the existing one" (research.md
 * Decision 2) — github_connection.user_id already carries a UNIQUE constraint (002), the same
 * DB-level uniqueness precedent D5/D13 already established for TestRun idempotency and this
 * exact table. Never a separate check-then-write.
 */
export async function upsertGithubConnectionForCaller(
  callerId: string,
  input: { pat: string; scopes: string },
): Promise<GithubConnection> {
  const encryptedValue = encrypt(input.pat);
  const [row] = await db
    .insert(githubConnection)
    .values({ id: crypto.randomUUID(), userId: callerId, patReference: encryptedValue, scopes: input.scopes })
    .onConflictDoUpdate({
      target: githubConnection.userId,
      set: { patReference: encryptedValue, scopes: input.scopes, createdAt: new Date() },
    })
    .returning();
  return row!;
}

/** Ownership-scoped directly in the WHERE clause. A no-op (not an error) when no connection
 * exists — spec.md Edge Case: disconnecting with nothing to disconnect is not observable as
 * a failure. */
export async function deleteGithubConnectionForCaller(callerId: string): Promise<void> {
  await db.delete(githubConnection).where(eq(githubConnection.userId, callerId));
}

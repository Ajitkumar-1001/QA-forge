import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { linearConnection, type LinearConnection } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

export async function getLinearConnectionForCaller(callerId: string): Promise<LinearConnection | null> {
  const row = await db.query.linearConnection.findFirst({
    where: eq(linearConnection.userId, callerId),
  });
  return row ?? null;
}

/**
 * 008-slack-linear-integrations: same shape as upsertSlackConnectionForCaller/
 * upsertGithubConnectionForCaller — single onConflictDoUpdate statement, encryption inside
 * the repository layer. Matters more here than for Slack: the two-step connect flow
 * (research.md Decision 7) makes two concurrent connectLinearAction submissions for the
 * same user a real case, not theoretical.
 */
export async function upsertLinearConnectionForCaller(
  callerId: string,
  input: { apiKey: string; teamId: string; teamName: string },
): Promise<LinearConnection> {
  const encryptedValue = encrypt(input.apiKey);
  const [row] = await db
    .insert(linearConnection)
    .values({ id: crypto.randomUUID(), userId: callerId, apiKeyReference: encryptedValue, teamId: input.teamId, teamName: input.teamName })
    .onConflictDoUpdate({
      target: linearConnection.userId,
      set: { apiKeyReference: encryptedValue, teamId: input.teamId, teamName: input.teamName, createdAt: new Date() },
    })
    .returning();
  return row!;
}

/** Ownership-scoped directly in the WHERE clause. A no-op (not an error) when no connection
 * exists — matches deleteGithubConnectionForCaller's precedent (FR-006 [spec]). */
export async function deleteLinearConnectionForCaller(callerId: string): Promise<void> {
  await db.delete(linearConnection).where(eq(linearConnection.userId, callerId));
}

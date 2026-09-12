import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { slackConnection, type SlackConnection } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

export async function getSlackConnectionForCaller(callerId: string): Promise<SlackConnection | null> {
  const row = await db.query.slackConnection.findFirst({
    where: eq(slackConnection.userId, callerId),
  });
  return row ?? null;
}

/**
 * 008-slack-linear-integrations: encrypts the plaintext webhook URL here, inside the
 * repository layer — matches upsertGithubConnectionForCaller's exact precedent, so
 * Constitution IV's responsibility lives in one place. Single `onConflictDoUpdate`
 * statement, not check-then-write — slack_connection.user_id already carries a UNIQUE
 * constraint (schema.ts), the same DB-level uniqueness precedent github_connection uses.
 * Race-safe by construction under concurrent upserts for the same caller.
 */
export async function upsertSlackConnectionForCaller(
  callerId: string,
  input: { webhookUrl: string },
): Promise<SlackConnection> {
  const encryptedValue = encrypt(input.webhookUrl);
  const [row] = await db
    .insert(slackConnection)
    .values({ id: crypto.randomUUID(), userId: callerId, webhookUrlReference: encryptedValue })
    .onConflictDoUpdate({
      target: slackConnection.userId,
      set: { webhookUrlReference: encryptedValue, createdAt: new Date() },
    })
    .returning();
  return row!;
}

/** Ownership-scoped directly in the WHERE clause. A no-op (not an error) when no connection
 * exists — matches deleteGithubConnectionForCaller's precedent (FR-005). */
export async function deleteSlackConnectionForCaller(callerId: string): Promise<void> {
  await db.delete(slackConnection).where(eq(slackConnection.userId, callerId));
}

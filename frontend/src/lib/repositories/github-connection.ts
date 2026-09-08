import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { githubConnection, type GithubConnection } from "@/db/schema";

export async function getGithubConnectionForCaller(callerId: string): Promise<GithubConnection | null> {
  const row = await db.query.githubConnection.findFirst({
    where: eq(githubConnection.userId, callerId),
  });
  return row ?? null;
}

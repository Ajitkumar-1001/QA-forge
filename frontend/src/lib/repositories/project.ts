import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, type Project } from "@/db/schema";

export async function createProjectForCaller(
  callerId: string,
  input: { applicationUrl: string; repository: string },
): Promise<Project> {
  const [row] = await db
    .insert(project)
    .values({
      id: crypto.randomUUID(),
      userId: callerId,
      applicationUrl: input.applicationUrl,
      repository: input.repository,
    })
    .returning();
  return row!;
}

/**
 * One statement, ownership scoped directly in the WHERE clause (ownership-convention.md
 * rule 3) — every row scoped under this project cascades via the FK ON DELETE CASCADE
 * chain (data-model.md) in the same transaction, no application-level loop (FR-009, US4).
 */
export async function deleteProjectForCaller(
  callerId: string,
  projectId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found_or_not_owned" }> {
  const [deleted] = await db
    .delete(project)
    .where(and(eq(project.id, projectId), eq(project.userId, callerId)))
    .returning({ id: project.id });

  return deleted ? { ok: true } : { ok: false, reason: "not_found_or_not_owned" };
}

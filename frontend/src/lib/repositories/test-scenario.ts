import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { testScenario, project, type TestScenario } from "@/db/schema";

function rowToTestScenario(row: Record<string, unknown>): TestScenario {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    objective: row.objective as string,
    credentialsReference: row.credentials_reference as string | null,
    createdAt: row.created_at as Date,
  };
}

/**
 * Ownership-scoped insert (research.md #4's addendum): identical shape to
 * startRunForCaller's INSERT ... SELECT ... WHERE, minus the conflict clause —
 * ownership is folded into the same statement that creates the row, never a
 * separate check-then-insert.
 */
export async function createScenarioForCaller(
  callerId: string,
  input: { projectId: string; objective: string; credentialsReference: string | null },
): Promise<TestScenario | { ok: false; reason: "not_found_or_not_owned" }> {
  const newId = crypto.randomUUID();

  const result = await db.execute(sql`
    INSERT INTO ${testScenario} (id, project_id, objective, credentials_reference)
    SELECT ${newId}, p.id, ${input.objective}, ${input.credentialsReference}
    FROM ${project} p
    WHERE p.id = ${input.projectId} AND p.user_id = ${callerId}
    RETURNING *
  `);

  if (result.rows.length === 0) {
    return { ok: false, reason: "not_found_or_not_owned" };
  }

  return rowToTestScenario(result.rows[0] as Record<string, unknown>);
}

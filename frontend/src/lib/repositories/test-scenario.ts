import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { testScenario, project, credential, type TestScenario } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

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
 *
 * 005-run-launch-ui: `credentialValue`, when present, takes precedence over
 * `credentialsReference` — the scenario and a new `credential` row (its plaintext
 * value AES-256-GCM-encrypted via src/lib/crypto.ts) are created in one transaction,
 * and `credentials_reference` is set to the new credential row's id. This is
 * additive, not a replacement: `credentialsReference` keeps its exact prior meaning
 * (an opaque string or null, e.g. cli/run.ts's own `"cli-env:QAFORGE_CREDENTIAL"`
 * marker) when `credentialValue` is absent — cli/run.ts's call site is unchanged.
 */
export async function createScenarioForCaller(
  callerId: string,
  input: { projectId: string; objective: string; credentialsReference: string | null; credentialValue?: string },
): Promise<TestScenario | { ok: false; reason: "not_found_or_not_owned" }> {
  if (input.credentialValue !== undefined) {
    return db.transaction(async (tx) => {
      const newId = crypto.randomUUID();
      const inserted = await tx.execute(sql`
        INSERT INTO ${testScenario} (id, project_id, objective, credentials_reference)
        SELECT ${newId}, p.id, ${input.objective}, NULL
        FROM ${project} p
        WHERE p.id = ${input.projectId} AND p.user_id = ${callerId}
        RETURNING *
      `);
      if (inserted.rows.length === 0) {
        return { ok: false, reason: "not_found_or_not_owned" } as const;
      }

      const credentialId = crypto.randomUUID();
      await tx.insert(credential).values({
        id: credentialId,
        testScenarioId: newId,
        encryptedValue: encrypt(input.credentialValue!),
      });

      // .returning() (query-builder API) already returns a camelCase-mapped TestScenario —
      // unlike the raw sql`` path below, which needs rowToTestScenario's snake_case parse.
      const [updated] = await tx
        .update(testScenario)
        .set({ credentialsReference: credentialId })
        .where(eq(testScenario.id, newId))
        .returning();

      return updated!;
    });
  }

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

/**
 * Re-scopes ownership through the full credential -> test_scenario -> project chain
 * (004's getRunForCaller precedent: never trust an earlier lookup for a later read).
 * Returns null both when the scenario has no credential and when the scenario
 * doesn't exist/isn't owned by the caller — startRunAction (the only caller) always
 * holds a scenario it just created for this same caller in this same request, so a
 * mismatch here would be a bug in the caller, not a real case worth a distinct shape.
 * Called once per run, immediately before runQaInvestigation — never cached.
 */
export async function resolveCredentialForCaller(callerId: string, testScenarioId: string): Promise<string | null> {
  const rows = await db
    .select({ encryptedValue: credential.encryptedValue })
    .from(credential)
    .innerJoin(testScenario, eq(credential.testScenarioId, testScenario.id))
    .innerJoin(project, eq(testScenario.projectId, project.id))
    .where(and(eq(credential.testScenarioId, testScenarioId), eq(project.userId, callerId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return decrypt(row.encryptedValue);
}

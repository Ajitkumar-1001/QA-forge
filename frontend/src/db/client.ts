import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// NFR-005: DATABASE_URL must itself be a pooled connection string (PgBouncer / a provider's
// pooled string / Supavisor) for serverless — this Pool is the application-level pool on top of
// that, never a raw single per-invocation connection.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env.local.example).");
}

// Next.js dev-mode hot reload re-evaluates this module on every edit; without caching the pool
// on `globalThis`, each reload would open a new one and leak connections toward NFR-005's
// exhaustion limit. Never applies in a real serverless invocation (a fresh module scope per
// cold start) or in production — this is a dev-only guard.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });

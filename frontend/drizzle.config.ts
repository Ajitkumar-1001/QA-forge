import { defineConfig } from "drizzle-kit";

// NFR-005: DATABASE_URL must be a pooled connection string (PgBouncer / provider-pooled /
// Supavisor), never a raw per-invocation connection — see src/db/client.ts.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required to run drizzle-kit (see .env.local.example).",
  );
}

export default defineConfig({
  // Better Auth's adapter tables + GithubConnection (T006/T007) — not yet created.
  schema: "./src/db/schema.ts",
  // Versioned, committed migrations (NFR-004) — `drizzle-kit generate` only, never `push`.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

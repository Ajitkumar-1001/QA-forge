// user/session/account/verification below are Better Auth's own generated adapter schema
// (FR-011) — produced by `npx better-auth generate --config <a betterAuth() config> --output
// src/db/schema.ts -y`, scoped to this feature's GitHub-OAuth-only provider config
// (research.md #4). Verified against this project's actually-installed better-auth@1.7.3 via
// direct `getSchema()` introspection, not just the CLI's own (older, deprecated-package)
// generator. `user.email`/`user.name` come out NOT NULL by Better Auth's default, not nullable as
// data-model.md originally assumed — kept as generated, per the user-confirmed decision recorded
// in data-model.md (2026-09-07), not silently overridden. `account.password` is an always-unused
// nullable column from Better Auth's core schema (no email/password provider is configured, FR-001)
// — left in place because removing it isn't a supported adapter customization and the column is
// never written to, not a plaintext-password violation of SEC-001.
//
// GithubConnection (below the generated block) is this feature's own table — re-run generation
// only for the Better Auth tables above; hand-maintain GithubConnection alongside it.

import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    // Stored raw by Better Auth's adapter (verified via internal-adapter.mjs's
    // `createSession`: `token: generateId(32)`, no hashing) — this feature's own
    // implementation is responsible for hashing it before persistence (research.md #8,
    // Constitution Principle IV); T008 covers the write/read-path override, not this schema.
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // accessToken/refreshToken: columns exist because Better Auth's adapter expects them
    // structurally, but this feature's sign-up/link hook strips them before write (SEC-002) —
    // that hook is T022, not part of this schema file.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    // Unused: no email/password provider is configured (FR-001, GitHub OAuth only) — always
    // null, never written to. See the file header note.
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  githubConnection: many(githubConnection),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// GithubConnection (FR-012, PRD §15/D13) — this feature's own table, not Better Auth's. One
// PAT-based connection per User; the `connect`/`disconnect`/`repositories` operations that
// populate/read it are a later GitHub-integration feature's scope (data-model.md).
export const githubConnection = pgTable("github_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique() // FR-012: one connection per user, enforced at the DB, not app-code check-then-insert.
    .references(() => user.id, { onDelete: "cascade" }),
  // App-layer AEAD-encrypted before write (SEC-002) — see src/lib/crypto.ts (T011). This column
  // holds ciphertext + IV, never a plaintext PAT.
  patReference: text("pat_reference").notNull(),
  // Type only, per data-model.md — value shape is the later GitHub-integration feature's call
  // once PRD D13 (still Proposed) settles.
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const githubConnectionRelations = relations(githubConnection, ({ one }) => ({
  user: one(user, {
    fields: [githubConnection.userId],
    references: [user.id],
  }),
}));

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import callerIdFirstParam from "./eslint-rules/callerId-first-param.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // SEC-009: structural enforcement of the callerId-scoped-query convention
  // (contracts/ownership-convention.md) — scoped to the one directory that convention governs.
  {
    files: ["src/lib/repositories/**/*.ts"],
    plugins: { "sec-009": callerIdFirstParam },
    rules: { "sec-009/callerId-first-param": "error" },
  },
  // FR-008's exemption's other half (data-model.md's "Cross-cutting: system-only repository
  // methods"): system-only DB access (Better Auth's own adapter, a future D7 worker/scheduler)
  // must stay unreachable from tRPC-facing code. tRPC procedures don't exist in this repo yet
  // (a later feature), so this restricts the nearest real proxy for "tRPC-facing" today —
  // src/app/** — from importing the raw DB client/schema/adapter directly; the only supported
  // path in is src/lib/repositories/** (SEC-009's own convention) or a feature's *-service.ts
  // composition above it.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db/client", "@/db/schema", "drizzle-orm", "drizzle-orm/*", "better-auth/adapters/*"],
              message:
                "src/app/** must not import the DB client/schema/adapter directly (FR-008's exemption boundary) — go through src/lib/repositories/** (SEC-009) or a *-service.ts composition above it.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

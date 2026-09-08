import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import callerIdFirstParam from "./eslint-rules/callerId-first-param.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["src/lib/repositories/**/*.ts"],
    plugins: { "sec-009": callerIdFirstParam },
    rules: { "sec-009/callerId-first-param": "error" },
  },

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

  globalIgnores([

    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

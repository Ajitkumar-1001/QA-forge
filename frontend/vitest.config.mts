import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".next/**"],
    // ponytail: default file parallelism spins up one PGlite (WASM Postgres) instance per
    // test file concurrently — with 36 files that starves CPU badly enough to blow past the
    // 5s/10s test/hook timeouts, and a timed-out-but-not-cancelled query can land late and
    // corrupt a later test in the same file (confirmed: `pnpm test` failed 9 files/17 tests;
    // `vitest run --fileParallelism=false` passed all 235). Serial is also not slower here
    // (22.9s parallel-but-broken vs 29.0s serial-but-correct), so there's no tradeoff to weigh.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

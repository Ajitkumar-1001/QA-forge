import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",

  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

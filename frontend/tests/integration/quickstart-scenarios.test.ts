import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/**
 * T049 — quickstart.md's five scenarios. What's actually run here, and why, matters more than
 * checking a box:
 *
 * - **Guardrail scenarios (SSRF, credential redaction)**: already run for real, end-to-end,
 *   in `guardrail-ssrf.test.ts` / `guardrail-redaction.test.ts` — not repeated here.
 * - **Scenarios 1 (FAIL), 2 (INCONCLUSIVE), 3 (PASS)**: their exact Report shapes are already
 *   proven for real, against a real browser and a real page (`https://example.com`), in
 *   `qa-investigation.workflow.test.ts` (T030/T041/T043) — not repeated here.
 * - **What none of this exercises, in any test in this suite**: `generateTestPlan()`'s actual
 *   Anthropic call, or a real `pnpm qaforge` invocation against the demo app end to end — this
 *   environment has no `ANTHROPIC_API_KEY`. A real, environment-imposed gap, flagged not hidden.
 *
 * **A genuine finding from trying to wire the demo app into `runQaInvestigation` directly for
 * this task**: it cannot be done, in *any* environment, not just this one. SEC-001's SSRF
 * deny-list is absolute (spec.md: "an accepted tradeoff, not an oversight") and denies every
 * loopback address — which includes the PRD §24 demo app's own address the moment it's run
 * locally, exactly like any other `--url` target would be denied. quickstart.md's Scenario 1
 * text implies the demo app's URL is usable directly with `--url`; that's only true once the demo
 * app is deployed somewhere with a real, non-loopback, non-private address. This is a direct,
 * previously-unstated consequence of D11's "keep absolute" decision, surfaced by actually
 * attempting the wiring rather than assuming it would work — worth a spec.md/quickstart.md note.
 *
 * What *is* run here for real: the demo app's own bug (T034), as a permanent regression test —
 * until now only verified once, manually, via `curl`.
 */
describe("PRD §24 demo app — the deliberately reproducible bug (T034 regression test)", () => {
  let demoApp: ChildProcess;
  const port = 4400 + Math.floor(Math.random() * 100);
  const demoAppUrl = `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    demoApp = spawn("npx", ["tsx", path.resolve(import.meta.dirname, "../../demo-app/server.ts")], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fetch(`${demoAppUrl}/login`);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("Demo app did not become ready in time");
  }, 15000);

  afterAll(() => {
    demoApp.kill();
  });

  it("login succeeds and creates a real server-side session", async () => {
    const response = await fetch(`${demoAppUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=demo&password=demo",
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toMatch(/^sid=/);
  });

  it("the dashboard rejects that same, genuinely-valid session — the deliberate bug", async () => {
    const loginResponse = await fetch(`${demoAppUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=demo&password=demo",
      redirect: "manual",
    });
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    const sid = setCookie.split(";")[0];

    const dashboardResponse = await fetch(`${demoAppUrl}/dashboard`, {
      headers: { Cookie: sid ?? "" },
      redirect: "manual",
    });

    // Deterministic, not a timing race: middleware.ts checks a cookie named "session"; login
    // only ever sets "sid". This must reproduce on every single run.
    expect(dashboardResponse.status).toBe(302);
    expect(dashboardResponse.headers.get("location")).toBe("/login");
  });

  it("is 100% deterministic — reproduces identically across repeated attempts", async () => {
    for (let i = 0; i < 3; i++) {
      const loginResponse = await fetch(`${demoAppUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "username=demo&password=demo",
        redirect: "manual",
      });
      const sid = (loginResponse.headers.get("set-cookie") ?? "").split(";")[0];
      const dashboardResponse = await fetch(`${demoAppUrl}/dashboard`, {
        headers: { Cookie: sid ?? "" },
        redirect: "manual",
      });
      expect(dashboardResponse.status).toBe(302);
    }
  });
});

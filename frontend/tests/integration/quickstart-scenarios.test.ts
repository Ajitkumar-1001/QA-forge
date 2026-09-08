import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

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

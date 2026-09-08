import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";

interface ExecFileOptions {
  env: Record<string, string>;
}
type ExecFileCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

let capturedAskPassContent: string | undefined;

const mockExecFile = vi.fn(
  (_command: string, _args: string[], options: ExecFileOptions, callback: ExecFileCallback) => {
    if (options.env.GIT_ASKPASS) {
      capturedAskPassContent = fs.readFileSync(options.env.GIT_ASKPASS, "utf-8");
    }
    callback(null, { stdout: "", stderr: "" });
  },
);

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

const { createInvestigateTool } = await import("@/mastra/tools/repository/investigate.tool");
const { createActionTools } = await import("@/mastra/tools/browser/actions.tool");

describe("GIT_ASKPASS keeps the token out of git's argv and .git/config (Constitution IV)", () => {
  it("never passes the token as a literal git argv element", async () => {
    const token = "ghp_fakeTokenLiteralForThisTestOnly";
    const tool = createInvestigateTool(token);

    await tool.execute!(
      { repoUrl: "https://github.com/owner/repo.git", searchText: "test", searchHistory: [] },
      {} as never,
    );

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [command, args] = mockExecFile.mock.calls[0]!;

    expect(command).toBe("git");
    expect(args).toEqual([
      "clone",
      "--depth",
      "1",
      "https://github.com/owner/repo.git",
      expect.any(String),
    ]);
    expect(args.join(" ")).not.toContain(token);
  });

  it("passes the token only via the GITHUB_TOKEN env var, read by an askpass script that never contains it", async () => {
    const token = "ghp_fakeTokenLiteralForThisTestOnly";
    const tool = createInvestigateTool(token);

    await tool.execute!(
      { repoUrl: "https://github.com/owner/repo.git", searchText: "test", searchHistory: [] },
      {} as never,
    );

    const [, , options] = mockExecFile.mock.calls.at(-1)!;
    expect(options.env.GITHUB_TOKEN).toBe(token);
    expect(options.env.GIT_ASKPASS).toMatch(/askpass\.sh$/);
    expect(capturedAskPassContent).not.toContain(token);
    expect(capturedAskPassContent).toContain("$GITHUB_TOKEN");
  });

  it("runs with GIT_TERMINAL_PROMPT=0 so an under-scoped token fails fast rather than hanging", async () => {
    const tool = createInvestigateTool("some-token");
    await tool.execute!(
      { repoUrl: "https://github.com/owner/repo.git", searchText: "test", searchHistory: [] },
      {} as never,
    );
    const [, , options] = mockExecFile.mock.calls.at(-1)!;
    expect(options.env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});

describe("actions.tool.ts's same-origin guard (closes the cross-origin-redirect credential-phishing gap)", () => {
  function fakePage(currentUrl: string): Page {
    return { url: () => currentUrl, getByRole: vi.fn() } as unknown as Page;
  }

  it("blocks fill when the page has navigated to a different origin than the run's original URL", async () => {
    const page = fakePage("https://attacker.example/login");
    const tools = createActionTools(page, "https://real-app.example/login");

    await expect(
      tools.fill.execute!({ role: "textbox", name: "Password", value: "hunter2" }, {} as never),
    ).rejects.toThrow("CROSS_ORIGIN_BLOCKED");
  });

  it("blocks submit identically", async () => {
    const page = fakePage("https://attacker.example/login");
    const tools = createActionTools(page, "https://real-app.example/login");

    await expect(
      tools.submit.execute!({ role: "button", name: "Log in" }, {} as never),
    ).rejects.toThrow("CROSS_ORIGIN_BLOCKED");
  });

  it("allows fill when the origin still matches (same host, different path)", async () => {
    const getByRole = vi.fn().mockReturnValue({ fill: vi.fn().mockResolvedValue(undefined) });
    const page = { url: () => "https://real-app.example/login/step2", getByRole } as unknown as Page;
    const tools = createActionTools(page, "https://real-app.example/login");

    await expect(
      tools.fill.execute!({ role: "textbox", name: "Password", value: "hunter2" }, {} as never),
    ).resolves.toBeDefined();
  });
});

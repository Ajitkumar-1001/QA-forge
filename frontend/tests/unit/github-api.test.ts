import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAndListGithubRepositories } from "@/lib/github-api";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockFetchSequence(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[call] ?? responses[responses.length - 1]!;
    call++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as Response;
  }) as typeof fetch;
}

describe("verifyAndListGithubRepositories — 007-github-connection (FR-002, FR-006)", () => {
  it("a 401 on /user is reported as INVALID_TOKEN, before ever calling /user/repos", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const result = await verifyAndListGithubRepositories("bad-token");
    expect(result).toEqual({ ok: false, reason: "INVALID_TOKEN" });
    expect(callCount).toBe(1);
  });

  it("a network error is reported as GITHUB_UNREACHABLE", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const result = await verifyAndListGithubRepositories("some-token");
    expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
  });

  it("a 5xx from GitHub is reported as GITHUB_UNREACHABLE, not INVALID_TOKEN", async () => {
    mockFetchSequence([{ status: 503 }]);
    const result = await verifyAndListGithubRepositories("some-token");
    expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
  });

  it("a valid token with repositories returns their full names", async () => {
    mockFetchSequence([
      { status: 200, body: { login: "octocat" } },
      { status: 200, body: [{ full_name: "octocat/hello-world" }, { full_name: "octocat/spoon-knife" }] },
    ]);
    const result = await verifyAndListGithubRepositories("good-token");
    expect(result).toEqual({ ok: true, repositories: ["octocat/hello-world", "octocat/spoon-knife"] });
  });

  it("a valid token with zero repositories returns an empty list, not an error", async () => {
    mockFetchSequence([{ status: 200, body: { login: "octocat" } }, { status: 200, body: [] }]);
    const result = await verifyAndListGithubRepositories("good-token");
    expect(result).toEqual({ ok: true, repositories: [] });
  });

  it("malformed JSON on an otherwise-200 /user/repos response is GITHUB_UNREACHABLE, not an uncaught throw", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ login: "octocat" }) } as Response;
      return {
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => {
          throw new SyntaxError("Unexpected token");
        },
      } as Response;
    }) as typeof fetch;

    const result = await verifyAndListGithubRepositories("good-token");
    expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
  });

  it("a 401 on /user/repos (token revoked mid-check) is still INVALID_TOKEN", async () => {
    mockFetchSequence([{ status: 200, body: { login: "octocat" } }, { status: 401 }]);
    const result = await verifyAndListGithubRepositories("good-then-bad-token");
    expect(result).toEqual({ ok: false, reason: "INVALID_TOKEN" });
  });
});

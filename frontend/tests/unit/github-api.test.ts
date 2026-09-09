import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAndListGithubRepositories, createGithubIssue, findExistingApprovalIssue } from "@/lib/github-api";

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

describe("createGithubIssue — D9/GitHub-Write-Path (PRD §14)", () => {
  it("a 201 with html_url is reported as ok", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      call++;
      expect(init?.method).toBe("POST");
      return { ok: true, status: 201, json: async () => ({ html_url: "https://github.com/owner/repo/issues/1" }) } as Response;
    }) as typeof fetch;

    const result = await createGithubIssue("token", "owner", "repo", "Title", "Body");
    expect(result).toEqual({ ok: true, htmlUrl: "https://github.com/owner/repo/issues/1" });
    expect(call).toBe(1);
  });

  it("a 401 is INVALID_TOKEN", async () => {
    mockFetchSequence([{ status: 401 }]);
    const result = await createGithubIssue("bad-token", "owner", "repo", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "INVALID_TOKEN" });
  });

  it("a 403/404/410/422/503 all collapse to GITHUB_UNREACHABLE, same as the read path above", async () => {
    for (const status of [403, 404, 410, 422, 503]) {
      mockFetchSequence([{ status }]);
      const result = await createGithubIssue("token", "owner", "repo", "Title", "Body");
      expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
    }
  });

  it("a network error is GITHUB_UNREACHABLE", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await createGithubIssue("token", "owner", "repo", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
  });

  it("malformed JSON on an otherwise-201 response is GITHUB_UNREACHABLE, not an uncaught throw", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async (): Promise<unknown> => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;
    const result = await createGithubIssue("token", "owner", "repo", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "GITHUB_UNREACHABLE" });
  });
});

describe("findExistingApprovalIssue — the duplicate-issue safety net (PRD §15, a mitigation not a guarantee)", () => {
  it("finds a match by the hidden marker in an issue body and returns its html_url", async () => {
    mockFetchSequence([
      {
        status: 200,
        body: [
          { body: "unrelated issue", html_url: "https://github.com/owner/repo/issues/1" },
          { body: "text <!-- qaforge-approval:ap-1 --> more text", html_url: "https://github.com/owner/repo/issues/2" },
        ],
      },
    ]);
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: true, htmlUrl: "https://github.com/owner/repo/issues/2" });
  });

  it("returns found:false when no issue body contains the marker", async () => {
    mockFetchSequence([{ status: 200, body: [{ body: "unrelated", html_url: "https://github.com/owner/repo/issues/1" }] }]);
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: false });
  });

  it("returns found:false for an empty issue list, not an error", async () => {
    mockFetchSequence([{ status: 200, body: [] }]);
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: false });
  });

  it("a null body on an issue doesn't crash the marker search", async () => {
    mockFetchSequence([{ status: 200, body: [{ body: null, html_url: "https://github.com/owner/repo/issues/1" }] }]);
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: false });
  });

  it("a 401 is reported distinctly, not confused with found:false", async () => {
    mockFetchSequence([{ status: 401 }]);
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: null, reason: "INVALID_TOKEN" });
  });

  it("a network error is reported distinctly, not confused with found:false", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await findExistingApprovalIssue("token", "owner", "repo", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: null, reason: "GITHUB_UNREACHABLE" });
  });
});

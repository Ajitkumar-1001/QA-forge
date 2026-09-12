import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAndListLinearTeams, createLinearIssue, findExistingLinearIssue } from "@/lib/linear-api";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockGraphqlResponse(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("verifyAndListLinearTeams — FR-002/FR-004/FR-010 [spec], research.md schema verification", () => {
  it("a valid key returns its teams", async () => {
    mockGraphqlResponse({ data: { teams: { nodes: [{ id: "team-1", name: "Engineering" }, { id: "team-2", name: "Design" }] } } });
    const result = await verifyAndListLinearTeams("lin_good_key");
    expect(result).toEqual({ ok: true, teams: [{ id: "team-1", name: "Engineering" }, { id: "team-2", name: "Design" }] });
  });

  it("a valid key with zero teams returns an empty list, not an error", async () => {
    mockGraphqlResponse({ data: { teams: { nodes: [] } } });
    const result = await verifyAndListLinearTeams("lin_good_key");
    expect(result).toEqual({ ok: true, teams: [] });
  });

  it("an authentication error (GraphQL errors array, no data) is INVALID_KEY", async () => {
    mockGraphqlResponse({ errors: [{ message: "Authentication required, not authenticated", extensions: { code: "AUTHENTICATION_ERROR" } }] });
    const result = await verifyAndListLinearTeams("lin_bad_key");
    expect(result).toEqual({ ok: false, reason: "INVALID_KEY" });
  });

  it("a network error is LINEAR_UNREACHABLE", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await verifyAndListLinearTeams("lin_key");
    expect(result).toEqual({ ok: false, reason: "LINEAR_UNREACHABLE" });
  });

  it("a non-ok HTTP status is LINEAR_UNREACHABLE", async () => {
    mockGraphqlResponse({}, 503);
    const result = await verifyAndListLinearTeams("lin_key");
    expect(result).toEqual({ ok: false, reason: "LINEAR_UNREACHABLE" });
  });

  it("malformed JSON on an otherwise-200 response is LINEAR_UNREACHABLE, not an uncaught throw", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;
    const result = await verifyAndListLinearTeams("lin_key");
    expect(result).toEqual({ ok: false, reason: "LINEAR_UNREACHABLE" });
  });
});

describe("createLinearIssue — additive alongside GitHub's issue (PRD FR-006/spec FR-009)", () => {
  it("a successful mutation returns the issue url", async () => {
    mockGraphqlResponse({ data: { issueCreate: { success: true, issue: { url: "https://linear.app/team/issue/ENG-1" } } } });
    const result = await createLinearIssue("lin_key", "team-1", "Title", "Body");
    expect(result).toEqual({ ok: true, issueUrl: "https://linear.app/team/issue/ENG-1" });
  });

  it("an authentication error is INVALID_KEY", async () => {
    mockGraphqlResponse({ errors: [{ message: "Authentication required, not authenticated", extensions: { code: "AUTHENTICATION_ERROR" } }] });
    const result = await createLinearIssue("lin_key", "team-1", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "INVALID_KEY" });
  });

  it("a network error is LINEAR_UNREACHABLE", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await createLinearIssue("lin_key", "team-1", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "LINEAR_UNREACHABLE" });
  });

  it("success:false in the mutation payload (no top-level GraphQL error) is still reported as a failure, not a false ok", async () => {
    mockGraphqlResponse({ data: { issueCreate: { success: false, issue: null } } });
    const result = await createLinearIssue("lin_key", "team-1", "Title", "Body");
    expect(result).toEqual({ ok: false, reason: "LINEAR_UNREACHABLE" });
  });
});

describe("findExistingLinearIssue — marker-search recovery (FR-007 [PRD]/FR-010 [spec], mirrors findExistingApprovalIssue)", () => {
  it("finds a match by the hidden marker in an issue description and returns its url", async () => {
    mockGraphqlResponse({
      data: {
        issues: {
          nodes: [
            { id: "i1", url: "https://linear.app/team/issue/ENG-1" },
            { id: "i2", url: "https://linear.app/team/issue/ENG-2" },
          ],
        },
      },
    });
    const result = await findExistingLinearIssue("lin_key", "team-1", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: true, issueUrl: "https://linear.app/team/issue/ENG-1" });
  });

  it("returns found:false for an empty match list, not an error", async () => {
    mockGraphqlResponse({ data: { issues: { nodes: [] } } });
    const result = await findExistingLinearIssue("lin_key", "team-1", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: false });
  });

  it("the outgoing query requests exactly first:100, orderBy:createdAt, and a team+description filter — not merely some filter (plan-eng-review finding)", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return { ok: true, status: 200, json: async () => ({ data: { issues: { nodes: [] } } }) } as Response;
    }) as typeof fetch;

    await findExistingLinearIssue("lin_key", "team-1", "<!-- qaforge-approval:ap-1 -->");

    const { query, variables } = JSON.parse(capturedBody!) as { query: string; variables: Record<string, unknown> };
    expect(query).toContain("first: 100");
    expect(query).toContain("orderBy: createdAt");
    expect(variables).toMatchObject({ teamId: "team-1", marker: "<!-- qaforge-approval:ap-1 -->" });
  });

  it("a 401/authentication error is reported distinctly, not confused with found:false", async () => {
    mockGraphqlResponse({ errors: [{ message: "Authentication required, not authenticated", extensions: { code: "AUTHENTICATION_ERROR" } }] });
    const result = await findExistingLinearIssue("lin_key", "team-1", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: null, reason: "INVALID_KEY" });
  });

  it("a network error is reported distinctly, not confused with found:false", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await findExistingLinearIssue("lin_key", "team-1", "<!-- qaforge-approval:ap-1 -->");
    expect(result).toEqual({ found: null, reason: "LINEAR_UNREACHABLE" });
  });
});

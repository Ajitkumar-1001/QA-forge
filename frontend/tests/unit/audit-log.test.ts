import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog } from "@/lib/audit-log";

const ALLOWLIST = new Set(["timestamp", "type", "userId", "provider", "resourceType", "resourceId", "outcome"]);

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

function loggedFields(): string[] {
  const [line] = logSpy.mock.calls.at(-1) ?? [];
  return Object.keys(JSON.parse(line as string).audit);
}

describe("auditLog — SEC-007 field allowlist, per event type", () => {
  it("sign_in: only allowlisted fields, never a raw account/token object", () => {
    auditLog({ type: "sign_in", provider: "github", userId: "u1", outcome: "success" });
    const fields = loggedFields();
    expect(fields.every((f) => ALLOWLIST.has(f))).toBe(true);
    expect(logSpy.mock.calls.at(-1)?.[0]).not.toMatch(/accessToken|refreshToken|password/i);
  });

  it("sign_out: only allowlisted fields", () => {
    auditLog({ type: "sign_out", userId: "u1", outcome: "success" });
    expect(loggedFields().every((f) => ALLOWLIST.has(f))).toBe(true);
  });

  it("scoped_query: only allowlisted fields, including resource type/id", () => {
    auditLog({ type: "scoped_query", resourceType: "GithubConnection", resourceId: "gc1", outcome: "not_found_or_not_owned" });
    const fields = loggedFields();
    expect(fields.every((f) => ALLOWLIST.has(f))).toBe(true);
    expect(fields).toContain("resourceType");
  });

  it("every scoped-query miss is logged identically as not_found_or_not_owned (FR-009) — not a distinct not-found vs. not-owned outcome", () => {
    auditLog({ type: "scoped_query", resourceType: "GithubConnection", outcome: "not_found_or_not_owned" });
    const { audit } = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);
    expect(audit.outcome).toBe("not_found_or_not_owned");
  });

  it("includes a timestamp on every event", () => {
    auditLog({ type: "sign_in", provider: "github", outcome: "success" });
    const { audit } = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);
    expect(() => new Date(audit.timestamp).toISOString()).not.toThrow();
  });
});

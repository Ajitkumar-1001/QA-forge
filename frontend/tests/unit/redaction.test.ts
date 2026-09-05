import { describe, expect, it } from "vitest";
import {
  redactBody,
  redactHeaders,
  redactValue,
} from "@/mastra/tools/browser/evidence.tool";

describe("redactValue — the literal supplied-credential value (SEC-002)", () => {
  it("masks every occurrence of the literal credential value", () => {
    const result = redactValue("token=sekret123 and again sekret123", "sekret123");
    expect(result).not.toContain("sekret123");
    expect(result).toBe("token=[REDACTED] and again [REDACTED]");
  });

  it("is a no-op when no credential was supplied for this run", () => {
    expect(redactValue("nothing secret here", undefined)).toBe("nothing secret here");
  });
});

describe("redactHeaders — header values masked, names/presence preserved (FR-006)", () => {
  it("redacts Authorization, Cookie, and Set-Cookie values", () => {
    const result = redactHeaders({
      Authorization: "Bearer abc123",
      Cookie: "session=xyz",
      "Set-Cookie": "session=xyz; HttpOnly",
      "X-Request-Id": "req-1",
    });
    expect(result.Authorization).toBe("[REDACTED]");
    expect(result.Cookie).toBe("[REDACTED]");
    expect(result["Set-Cookie"]).toBe("[REDACTED]");
    expect(result["X-Request-Id"]).toBe("req-1");
    // Names and presence are preserved even though values are masked.
    expect(Object.keys(result)).toEqual(["Authorization", "Cookie", "Set-Cookie", "X-Request-Id"]);
  });

  it("is case-insensitive on the header name", () => {
    const result = redactHeaders({ authorization: "Bearer abc123" });
    expect(result.authorization).toBe("[REDACTED]");
  });

  it("still masks the literal credential value in a non-credential header", () => {
    const result = redactHeaders({ "X-Debug": "value=sekret123" }, "sekret123");
    expect(result["X-Debug"]).toBe("value=[REDACTED]");
  });
});

describe("redactBody — credential-like field names, case-insensitive keyword match (SEC-002)", () => {
  it("redacts fields matching common credential-like key patterns", () => {
    const result = redactBody({
      username: "alice",
      password: "hunter2",
      apiKey: "abc",
      api_key: "def",
      token: "ghi",
      secret: "jkl",
      Authorization: "mno",
      nested: { credential: "pqr" },
    }) as Record<string, unknown>;

    expect(result.username).toBe("alice");
    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
    expect(result.secret).toBe("[REDACTED]");
    expect(result.Authorization).toBe("[REDACTED]");
    expect((result.nested as Record<string, unknown>).credential).toBe("[REDACTED]");
  });

  it("recurses into arrays", () => {
    const result = redactBody([{ password: "hunter2" }, { username: "alice" }]) as Record<
      string,
      unknown
    >[];
    expect(result[0]?.password).toBe("[REDACTED]");
    expect(result[1]?.username).toBe("alice");
  });

  it("masks the literal credential value inside a body field the key-pattern match missed", () => {
    const result = redactBody(
      { message: "your session token is sekret123" },
      "sekret123",
    ) as Record<string, unknown>;
    expect(result.message).toBe("your session token is [REDACTED]");
  });

  it("leaves non-credential-shaped bodies untouched", () => {
    expect(redactBody({ status: "ok", count: 3 })).toEqual({ status: "ok", count: 3 });
  });
});

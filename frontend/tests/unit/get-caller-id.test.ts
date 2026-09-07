import { beforeAll, describe, expect, it, vi } from "vitest";

// betterAuth() construction needs these to even build the instance; the actual DB is never hit
// in this file — every case mocks `auth.api.getSession` directly (FR-015 is a thin wrapper
// around it, and Better Auth's own session-resolution/DB behavior isn't this feature's test to
// write — see auth-flow.test.ts / auth-transaction.test.ts for that, both later tasks).
process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
process.env.GITHUB_CLIENT_ID ??= "x";
process.env.GITHUB_CLIENT_SECRET ??= "x";
process.env.AUTH_ENCRYPTION_KEY ??= require("node:crypto").randomBytes(32).toString("base64");

let getCallerId: typeof import("@/lib/auth").getCallerId;
let auth: typeof import("@/lib/auth").auth;

// Static `import` is hoisted above this file's own env-var setup above, which would construct
// betterAuth() before AUTH_ENCRYPTION_KEY etc. are set — dynamic import, after setup, avoids that.
beforeAll(async () => {
  ({ getCallerId, auth } = await import("@/lib/auth"));
});

describe("getCallerId — FR-015 session-resolution primitive", () => {
  it("resolves to the caller's userId when a valid session exists", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      session: {} as never,
      user: { id: "user-1" } as never,
    });
    expect(await getCallerId(new Headers())).toBe("user-1");
  });

  it("resolves to null when there is no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);
    expect(await getCallerId(new Headers())).toBeNull();
  });

  it("resolves to null for an expired session (Better Auth's own getSession already returns null — same path as no session, not a separate branch)", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);
    expect(await getCallerId(new Headers())).toBeNull();
  });

  it("resolves to null (denied) rather than throwing when session resolution fails (SEC-006 — an infra error is never treated as authenticated)", async () => {
    vi.spyOn(auth.api, "getSession").mockRejectedValueOnce(new Error("DB connection failed"));
    await expect(getCallerId(new Headers())).resolves.toBeNull();
  });
});

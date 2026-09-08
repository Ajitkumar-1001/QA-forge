import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.GITHUB_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const FAKE_PROFILE = {
  user: { name: "Ada Lovelace", email: "ada@example.com", image: "https://x/y.png", emailVerified: true },
  data: { id: "gh-1", login: "ada" },
};

let buildAuthOptions: typeof import("@/lib/auth").buildAuthOptions;

beforeEach(async () => {
  ({ buildAuthOptions } = await import("@/lib/auth"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const href = String((url as { url?: string })?.url ?? url);
      if (href.includes(GITHUB_TOKEN_ENDPOINT)) {
        return new Response(JSON.stringify({ access_token: "fake-gh-access-token", token_type: "bearer" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch in test: ${href}`);
    }),
  );
});

describe("FR-014 — first-sign-in User+Account creation (quickstart Scenario 2)", () => {
  it(
    "two near-simultaneous first-sign-in attempts for the same new GitHub identity produce " +
      "exactly one User row and one Account row, never an orphaned User",
    async () => {

      const { betterAuth } = await import("better-auth");
      const { memoryAdapter } = await import("better-auth/adapters/memory");
      const db = { user: [], session: [], account: [], verification: [] } as Record<string, Record<string, unknown>[]>;
      const options = buildAuthOptions({ database: memoryAdapter(db) }) as ReturnType<typeof buildAuthOptions> & {
        socialProviders: { github: { getUserInfo?: () => Promise<typeof FAKE_PROFILE> } };
      };
      options.socialProviders.github.getUserInfo = async () => FAKE_PROFILE;
      const auth = betterAuth({ ...options, baseURL: "http://localhost:3000" } as Parameters<typeof betterAuth>[0]) as unknown as {
        api: {
          signInSocial: (args: unknown) => Promise<Response>;
          callbackOAuth: (args: unknown) => Promise<Response>;
        };
      };

      async function startSignIn() {
        const res = await auth.api.signInSocial({ body: { provider: "github", callbackURL: "/dashboard" }, asResponse: true });
        const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
        const cookie = res.headers.get("set-cookie")!.split(";")[0];
        return { state, cookie };
      }

      const [a, b] = await Promise.all([startSignIn(), startSignIn()]);
      await Promise.all([
        auth.api.callbackOAuth({ params: { id: "github" }, query: { code: "code-a", state: a.state }, headers: new Headers({ cookie: a.cookie }), asResponse: true }),
        auth.api.callbackOAuth({ params: { id: "github" }, query: { code: "code-b", state: b.state }, headers: new Headers({ cookie: b.cookie }), asResponse: true }),
      ]);

      expect(db.user).toHaveLength(1);
      expect(db.account).toHaveLength(1);

      expect((db.account[0] as { userId: string }).userId).toBe((db.user[0] as { id: string }).id);
    },
  );
});

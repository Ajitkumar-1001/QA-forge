import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// The GitHub OAuth route handlers this feature adds (FR-001–FR-004;
// contracts/auth-routes.md): /api/auth/sign-in/social, /callback/github,
// /sign-out, /get-session — all Better Auth's own catch-all handler, no
// hand-authored route logic beyond the betterAuth() config in src/lib/auth.ts.
export const { GET, POST } = toNextJsHandler(auth);

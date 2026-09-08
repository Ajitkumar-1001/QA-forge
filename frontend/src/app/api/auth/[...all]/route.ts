import { NextResponse } from "next/server";

// The GitHub OAuth route handlers this feature adds (FR-001–FR-004;
// contracts/auth-routes.md): /api/auth/sign-in/social, /callback/github,
// /sign-out, /get-session — all Better Auth's own catch-all handler, no
// hand-authored route logic beyond the betterAuth() config in src/lib/auth.ts.
//
// SEC-006 / T042: unlike proxy.ts (a best-effort UX check with a safe pass-through fallback),
// every request to this route genuinely needs a working auth config to do anything at all —
// sign-in, sign-out, session lookup, the OAuth callback. A static `import { auth } from
// "@/lib/auth"` would let @/db/client's import-time DATABASE_URL check crash this route's own
// module load, taking the whole endpoint down with Next's generic, undifferentiated 500 (found
// live via /qa-only, confirmed via /speckit-converge). Deferring the import into the handler,
// wrapped in try/catch, lets us return the distinguishable 503-shaped response SEC-006 asks for
// ("a 503/retryable-shaped response for the infra fault vs. 401 for 'no valid session'") instead.
async function handle(request: Request): Promise<Response> {
  let auth: typeof import("@/lib/auth").auth;
  try {
    ({ auth } = await import("@/lib/auth"));
  } catch {
    return NextResponse.json(
      { error: "auth_unavailable", message: "Authentication is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const { toNextJsHandler } = await import("better-auth/next-js");
  const { GET: handleGet, POST: handlePost } = toNextJsHandler(auth);
  return request.method === "POST" ? handlePost(request) : handleGet(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

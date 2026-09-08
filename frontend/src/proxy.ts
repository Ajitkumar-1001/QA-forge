import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NFR-001's sliding-session refresh needs the "secure" DB-backed check (auth.api.getSession()),
// not an optimistic cookie-presence check — and per Better Auth's own documented pattern, proxy
// is the only place with cookie-write access outside a Server Action/Route Handler, which is
// exactly what a refresh needs to actually persist. The `nextCookies()` plugin (src/lib/auth.ts)
// writes via `next/headers`'s cookies() mutation, which isn't available in proxy's request/response
// model — so the refresh's Set-Cookie is read back explicitly via `returnHeaders: true` and
// forwarded onto the NextResponse by hand, rather than relying on the plugin here.
//
// research.md #6's flagged risk (Next.js strips internal RSC routing headers — `rsc`,
// `next-router-state-tree`, etc. — before they reach proxy's `request.headers`, which can affect
// header-dependent logic) doesn't block this: `getSession` only reads the `cookie` header, which
// Next.js does not strip.
//
// Routes actually requiring a session are NOT decided by this feature (see tasks.md T023) — this
// repo's existing product pages (dashboard, runs, findings, ...) predate auth entirely and GitHub
// OAuth isn't provisioned yet (T004/T005). PROTECTED_ROUTE_PREFIXES is empty on purpose: the
// refresh mechanism runs on every matched request regardless (harmless no-op without a session),
// but nothing redirects until a later task/feature opts specific routes in.
const PROTECTED_ROUTE_PREFIXES: readonly string[] = [];

export async function proxy(request: NextRequest) {
  // SEC-006 / T042: an infra error resolving the session here must deny (treat as no session)
  // for this request only — it must NOT crash proxy itself, which runs on every matched route
  // and would otherwise turn a transient DB outage into a site-wide 500 instead of a graceful
  // denial. The `.catch(() => null)` below only covers a *runtime* getSession() failure —
  // @/lib/auth also transitively imports @/db/client, which throws at module-*evaluation* time
  // if DATABASE_URL is missing/malformed. A static top-level `import { auth } from "@/lib/auth"`
  // let that throw fail proxy's own module load instead, which crashed every route this matcher
  // covers (found live via /qa-only, confirmed via /speckit-converge — T042). Deferring the
  // import into the function body, wrapped in try/catch, confines that failure the same way: no
  // session, safe pass-through — never a crash. (This is a UX-layer check only, not the
  // enforcement point — see the pass-through comment below; the Data Access Layer denies for
  // real regardless of what proxy does here.)
  let auth: typeof import("@/lib/auth").auth;
  try {
    ({ auth } = await import("@/lib/auth"));
  } catch {
    return NextResponse.next();
  }

  const result = await auth.api.getSession({ headers: request.headers, returnHeaders: true }).catch(() => null);

  const isProtected = PROTECTED_ROUTE_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (!result?.response && isProtected) {
    // UX-001: optimistic redirect for a signed-out visitor hitting a protected route with no
    // currently-rendered page — the real, DB-backed denial still happens server-side wherever
    // the route/Server Function actually reads the session (this is UX only, not the enforcement
    // point — Constitution Principle III's guarantee lives in the Data Access Layer, not here).
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const nextResponse = NextResponse.next();
  const setCookie = result?.headers.get("set-cookie");
  if (setCookie) nextResponse.headers.set("set-cookie", setCookie);
  return nextResponse;
}

export const config = {
  matcher: [
    // Every route except static assets, image optimization, and favicon — the standard
    // exclusion set (Next.js proxy.md's own "Negative matching" example) so the refresh doesn't
    // run needlessly on _next/static/_next/image, and _never_ on /api/auth/** (Better Auth's own
    // route handler manages its own cookies; re-reading/re-writing them here would be redundant
    // at best).
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};

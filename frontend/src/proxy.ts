import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A-first (login-gate plan): the whole app is protected by default now, not just /runs —
// PUBLIC_ROUTE_PREFIXES is the exemption list, not a growing allowlist of what to guard.
// config.matcher below already keeps api/auth, static assets, and favicon.ico out of this
// function entirely, so /sign-in is the only route that needs listing here.
const PUBLIC_ROUTE_PREFIXES: readonly string[] = ["/sign-in"];

export async function proxy(request: NextRequest) {

  let auth: typeof import("@/lib/auth").auth;
  try {
    ({ auth } = await import("@/lib/auth"));
  } catch {
    return NextResponse.next();
  }

  const result = await auth.api.getSession({ headers: request.headers, returnHeaders: true }).catch(() => null);

  // Segment-anchored, not a bare startsWith — adversarial review found a hypothetical
  // future "/sign-in-foo" route would otherwise silently become public too.
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!result?.response && !isPublic) {

    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const nextResponse = NextResponse.next();
  const setCookie = result?.headers.get("set-cookie");
  if (setCookie) nextResponse.headers.set("set-cookie", setCookie);
  return nextResponse;
}

export const config = {
  matcher: [

    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};

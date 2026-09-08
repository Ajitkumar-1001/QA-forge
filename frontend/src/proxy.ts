import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTE_PREFIXES: readonly string[] = [];

export async function proxy(request: NextRequest) {

  let auth: typeof import("@/lib/auth").auth;
  try {
    ({ auth } = await import("@/lib/auth"));
  } catch {
    return NextResponse.next();
  }

  const result = await auth.api.getSession({ headers: request.headers, returnHeaders: true }).catch(() => null);

  const isProtected = PROTECTED_ROUTE_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (!result?.response && isProtected) {

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

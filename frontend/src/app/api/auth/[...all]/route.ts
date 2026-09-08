import { NextResponse } from "next/server";

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

import type { IncomingMessage } from "node:http";
import { sessions } from "./sessions";

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  }
  return cookies;
}

/**
 * PRD §24's deliberately reproducible authentication bug: login (`server.ts`) succeeds and sets
 * the session cookie as `sid`, and the session genuinely exists in `sessions` — but this
 * middleware checks for a cookie named `session`. That's the entire bug: a cookie-name mismatch,
 * not a timing race, so it reproduces identically on every single run — this function always
 * rejects a freshly-authenticated user and sends them back to `/login`.
 */
export function isAuthenticated(req: IncomingMessage): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.session; // BUG: login sets `sid`, not `session` — see server.ts
  if (!sessionId) return false;
  return sessions.has(sessionId);
}

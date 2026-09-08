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

export function isAuthenticated(req: IncomingMessage): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.session;
  if (!sessionId) return false;
  return sessions.has(sessionId);
}

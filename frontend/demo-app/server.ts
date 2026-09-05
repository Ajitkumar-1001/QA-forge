#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import { isAuthenticated } from "./middleware";
import { sessions } from "./sessions";

/**
 * PRD §24's demo application (Office-Hours-Findings.md §4, reframed from OQ3a into a build task
 * by `/office-hours`) — a minimal target app carrying one deliberately reproducible bug:
 * login succeeds → a session is created → navigation to /dashboard occurs → the middleware
 * rejects the (valid) session → the user is bounced back to /login. See `middleware.ts` for the
 * actual bug. This is the reference scenario `quickstart.md`'s Scenario 1 points the harness at.
 */

const LOGIN_PAGE = `<!doctype html>
<html>
  <body>
    <h1>Log in</h1>
    <form method="POST" action="/login">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" />
      <button type="submit">Log in</button>
    </form>
  </body>
</html>`;

const DASHBOARD_PAGE = `<!doctype html>
<html>
  <body>
    <h1>Dashboard</h1>
  </body>
</html>`;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf-8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/login")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(LOGIN_PAGE);
      return;
    }

    if (req.method === "POST" && url.pathname === "/login") {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const username = params.get("username") ?? "user";
      // Login always succeeds — this demo app's bug is in the middleware, not the credential
      // check itself (PRD §24: "login succeeds, session created").
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, { username });
      res.writeHead(302, {
        Location: "/dashboard",
        "Set-Cookie": `sid=${sessionId}; Path=/; HttpOnly`,
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/dashboard") {
      if (!isAuthenticated(req)) {
        res.writeHead(302, { Location: "/login" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(DASHBOARD_PAGE);
      return;
    }

    res.writeHead(404);
    res.end();
  })();
});

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => {
  console.log(`Demo app listening on http://localhost:${port}`);
});

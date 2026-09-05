import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Local HTTP fixture server for integration tests (research.md §1's testing strategy — real
 * chromium against a local `node:http` server, not a mocked network). Exposes:
 *  - `/redirect/:n` → a chain of `n` 302 hops ending at `/ok` — for SEC-001's per-redirect-hop
 *    SSRF re-check test.
 *  - `/credential-body` → a JSON response body containing a credential-shaped field — for
 *    SEC-002's redaction test.
 *  - `/ok` → a plain 200 page.
 */
export function startFixtureServer(): Promise<FixtureServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      const redirectMatch = url.pathname.match(/^\/redirect\/(\d+)$/);
      if (redirectMatch) {
        const remaining = Number(redirectMatch[1]);
        const next = remaining > 1 ? `/redirect/${remaining - 1}` : "/ok";
        res.writeHead(302, { Location: next });
        res.end();
        return;
      }

      if (url.pathname === "/credential-body") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ username: "test-user", password: "super-secret-value" }));
        return;
      }

      if (url.pathname === "/ok") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>OK</h1></body></html>");
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error("Fixture server failed to bind to a port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

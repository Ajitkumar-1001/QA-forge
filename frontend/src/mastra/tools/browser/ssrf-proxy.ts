import net from "node:net";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

export interface SsrfProxy {
  port: number;
  close: () => Promise<void>;
}

/** Resolves `hostname`, rejects anything outside ipaddr.js's `'unicast'` classification (same
 * deny-list rule as Layers A/B, research.md §4), and returns the literal validated address. */
async function resolveAllowedAddress(hostname: string): Promise<string> {
  const { address } = await dns.lookup(hostname);
  if (ipaddr.parse(address).range() !== "unicast") {
    throw new Error(`SSRF_DENIED: ${hostname} resolved to a disallowed address (${address})`);
  }
  return address;
}

/**
 * SSRF Layer C (research.md §4): a local validating forward proxy, meant to be passed to
 * `chromium.launch({ proxy: toLaunchProxyOption(proxy) })`. Closes the DNS-rebinding TOCTOU race
 * Layer B's application-level check can't: resolves DNS, validates the range, THEN connects by the
 * literal validated IP — never re-resolving the hostname, which would reopen the same race one
 * layer down. Handles CONNECT tunnels only (how Chromium routes HTTPS traffic through a
 * configured proxy); a non-CONNECT request is rejected rather than silently ignored.
 *
 * Binds to a random port (`listen(0)`, never fixed) on loopback only. A bind failure rejects the
 * returned promise — the caller sees an explicit error, never a hang.
 */
export function startSsrfProxy(): Promise<SsrfProxy> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((clientSocket) => {
      let buffered = Buffer.alloc(0);

      const onData = (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        const headerEnd = buffered.indexOf("\r\n\r\n");
        if (headerEnd === -1) return; // wait for the full request line + headers
        clientSocket.off("data", onData);
        void handleRequest(buffered.subarray(0, headerEnd).toString("utf8"), clientSocket);
      };

      clientSocket.on("data", onData);
      clientSocket.on("error", () => {});
    });

    const handleRequest = async (headerText: string, clientSocket: net.Socket) => {
      const requestLine = headerText.split("\r\n")[0] ?? "";
      const [method, target] = requestLine.split(" ");

      if (method !== "CONNECT" || !target) {
        clientSocket.end("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
        return;
      }

      const lastColon = target.lastIndexOf(":");
      const hostname = lastColon === -1 ? target : target.slice(0, lastColon);
      const port = lastColon === -1 ? 443 : Number(target.slice(lastColon + 1)) || 443;

      let address: string;
      try {
        address = await resolveAllowedAddress(hostname);
      } catch {
        clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }

      const upstream = net.connect({ host: address, port }, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
    };

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("SSRF proxy failed to bind to a port"));
        return;
      }
      server.on("error", () => {}); // post-bind errors (e.g. a bad client) must not crash the process
      resolve({
        port: address.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

/**
 * Chromium's default proxy config implicitly bypasses loopback *and* link-local (the
 * cloud-metadata range) unless the bypass list is overridden — pass this explicitly rather than
 * relying on that default silently (research.md §4).
 */
export function toLaunchProxyOption(proxy: SsrfProxy): { server: string; bypass: string } {
  return { server: `127.0.0.1:${proxy.port}`, bypass: "<-loopback>" };
}

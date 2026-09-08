import net from "node:net";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

export interface SsrfProxy {
  port: number;
  close: () => Promise<void>;
}

async function resolveAllowedAddress(hostname: string): Promise<string> {
  const { address } = await dns.lookup(hostname);
  if (ipaddr.parse(address).range() !== "unicast") {
    throw new Error(`SSRF_DENIED: ${hostname} resolved to a disallowed address (${address})`);
  }
  return address;
}

export function startSsrfProxy(): Promise<SsrfProxy> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((clientSocket) => {
      let buffered = Buffer.alloc(0);

      const onData = (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        const headerEnd = buffered.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
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
      server.on("error", () => {});
      resolve({
        port: address.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

export function toLaunchProxyOption(proxy: SsrfProxy): { server: string; bypass: string } {
  return { server: `127.0.0.1:${proxy.port}`, bypass: "<-loopback>" };
}

import { describe, expect, it, vi } from "vitest";
import net from "node:net";
import { startSsrfProxy } from "@/mastra/tools/browser/ssrf-proxy";

describe("startSsrfProxy — port randomization", () => {
  it("binds to a random, non-fixed port each time", async () => {
    const proxyA = await startSsrfProxy();
    const proxyB = await startSsrfProxy();
    try {
      expect(proxyA.port).toBeGreaterThan(0);
      expect(proxyB.port).toBeGreaterThan(0);
      expect(proxyA.port).not.toBe(proxyB.port);
    } finally {
      await proxyA.close();
      await proxyB.close();
    }
  });
});

describe("startSsrfProxy — bind-failure path", () => {
  it("rejects rather than hangs when the server fails to bind", async () => {
    const fakeServer = {
      once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === "error") queueMicrotask(() => cb(new Error("EADDRINUSE")));
        return fakeServer;
      }),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      listen: vi.fn().mockReturnThis(),
      close: vi.fn((cb?: () => void) => cb?.()),
      address: vi.fn(),
    };
    const spy = vi
      .spyOn(net, "createServer")
      .mockReturnValue(fakeServer as unknown as net.Server);

    try {
      await expect(startSsrfProxy()).rejects.toThrow("EADDRINUSE");
    } finally {
      spy.mockRestore();
    }
  });
});

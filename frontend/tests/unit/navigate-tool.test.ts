import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";

// Layer A's DNS matcher is covered by ssrf.test.ts — mock it here to always resolve to a public
// address so these tests exercise page.goto()'s own failures, not Layer A's, without depending on
// real network/DNS access.
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) },
}));

const { createNavigateTool } = await import("@/mastra/tools/browser/navigate.tool");

function fakePage(goto: Page["goto"]): Page {
  return {
    goto,
    url: () => "https://example.com/current",
  } as unknown as Page;
}

describe("navigate tool — non-SSRF navigation failures (research.md §3)", () => {
  function fakeResponse(status: number, url: string) {
    return {
      status: () => status,
      ok: () => status >= 200 && status < 300,
      url: () => url,
      request: () => ({ redirectedFrom: () => null }),
    };
  }

  it("surfaces a 4xx status without throwing — page.goto() doesn't throw on 4xx/5xx", async () => {
    const page = fakePage(
      vi
        .fn()
        .mockResolvedValue(fakeResponse(404, "https://example.com/missing")) as unknown as Page["goto"],
    );
    const tool = createNavigateTool(page);
    const result = await tool.execute!({ url: "https://example.com/missing" }, {} as never);
    expect(result).toMatchObject({ status: 404, ok: false });
  });

  it("surfaces a 5xx status without throwing", async () => {
    const page = fakePage(
      vi
        .fn()
        .mockResolvedValue(fakeResponse(503, "https://example.com/down")) as unknown as Page["goto"],
    );
    const tool = createNavigateTool(page);
    const result = await tool.execute!({ url: "https://example.com/down" }, {} as never);
    expect(result).toMatchObject({ status: 503, ok: false });
  });

  it("propagates a DNS resolution failure thrown by page.goto()", async () => {
    const page = fakePage(
      vi.fn().mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED")) as unknown as Page["goto"],
    );
    const tool = createNavigateTool(page);
    await expect(tool.execute!({ url: "https://example.com" }, {} as never)).rejects.toThrow(
      "ERR_NAME_NOT_RESOLVED",
    );
  });

  it("propagates a navigation timeout thrown by page.goto()", async () => {
    const page = fakePage(
      vi.fn().mockRejectedValue(new Error("Timeout 30000ms exceeded")) as unknown as Page["goto"],
    );
    const tool = createNavigateTool(page);
    await expect(tool.execute!({ url: "https://example.com" }, {} as never)).rejects.toThrow(
      "Timeout",
    );
  });
});

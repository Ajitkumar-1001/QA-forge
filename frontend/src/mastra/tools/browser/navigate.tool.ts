import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { BrowserContext, Page } from "playwright";

/**
 * SSRF Layer A (UX only, research.md §4): resolve the hostname and reject anything outside
 * ipaddr.js's `'unicast'` range classification — covers loopback, link-local (including the
 * cloud-metadata range), private, reserved, carrier-grade-NAT, and IPv4-mapped-IPv6 uniformly,
 * without an enumerated, separately-maintained CIDR list (SEC-001, D11, resolved 2026-09-04
 * `/speckit-clarify`). Fails closed on any DNS error.
 */
export async function isAddressAllowed(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => ipaddr.parse(entry.address).range() === "unicast");
  } catch {
    return false;
  }
}

/** Full per-URL check: valid http(s) URL, and its hostname resolves only to allowed addresses. */
export async function isUrlAllowed(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isAddressAllowed(url.hostname);
}

/**
 * SSRF Layer B (research.md §4): per-hop enforcement via CDP `Fetch.requestPaused` — NOT
 * `page.route()`, which is empirically proven not to fire on redirect hops on a main-frame
 * navigation (microsoft/playwright#34994). The CDP `Fetch` domain fires once per hop, so this
 * re-checks every redirect, not only the initially supplied URL (SEC-001, SC-004). Installed on
 * every new page/popup so it covers the whole context lifetime, not just the first `page.goto()`
 * call this tool makes — a step that triggers navigation via `actions.tool.ts`'s `click`/`submit`
 * is covered too.
 */
export async function installNavigationGuard(context: BrowserContext): Promise<void> {
  const guardPage = async (page: Page) => {
    const session = await context.newCDPSession(page);
    await session.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
    session.on("Fetch.requestPaused", async (event) => {
      const allowed = await isUrlAllowed(event.request.url);
      if (allowed) {
        await session.send("Fetch.continueRequest", { requestId: event.requestId });
      } else {
        await session.send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        });
      }
    });
  };
  context.on("page", (page) => {
    void guardPage(page);
  });
  for (const page of context.pages()) {
    await guardPage(page);
  }
}

const navigateInputSchema = z.object({ url: z.string() });

/**
 * The navigation tool the Browser Execution Agent calls — navigation only; does NOT resolve or
 * execute a Step's action (that's `actions.tool.ts`). Assumes `installNavigationGuard` (Layer B)
 * has already been installed on the page's context and the launching browser used SSRF Layer C's
 * validating proxy (`ssrf-proxy.ts`) — this tool performs Layer A's pre-check plus the actual
 * `page.goto()`. `page.goto()` does not throw on 4xx/5xx, so status is surfaced explicitly rather
 * than treated as a thrown error (research.md §3).
 */
export function createNavigateTool(page: Page) {
  return createTool({
    id: "navigate",
    description:
      "Navigate the browser to a URL, refusing any private/loopback/link-local/cloud-metadata target.",
    inputSchema: navigateInputSchema,
    execute: async ({ url }) => {
      if (!(await isUrlAllowed(url))) {
        throw new Error(`SSRF_DENIED: refusing to navigate to ${url}`);
      }
      const response = await page.goto(url);
      return {
        url: page.url(),
        status: response?.status() ?? null,
        ok: response?.ok() ?? false,
      };
    },
  });
}

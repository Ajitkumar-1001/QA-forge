import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { BrowserContext, Page, Response } from "playwright";

export async function isAddressAllowed(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => ipaddr.parse(entry.address).range() === "unicast");
  } catch {
    return false;
  }
}

export class SsrfDeniedError extends Error {
  readonly reason = "APP_UNREACHABLE" as const;

  constructor(url: string) {
    super(`SSRF_DENIED: refusing to navigate to ${url}`);
    this.name = "SsrfDeniedError";
  }
}

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

export interface NavigationGuard {

  consumeBlockedUrl(): string | null;
}

export async function installNavigationGuard(context: BrowserContext): Promise<NavigationGuard> {
  let blockedUrl: string | null = null;
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
        blockedUrl = event.request.url;
        await session.send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        });
      }
    });
  };
  context.on("page", (page) => {

    guardPage(page).catch(() => {});
  });
  for (const page of context.pages()) {
    await guardPage(page);
  }
  return {
    consumeBlockedUrl: () => {
      const url = blockedUrl;
      blockedUrl = null;
      return url;
    },
  };
}

export function getRedirectChain(response: Response | null): string[] {
  if (!response) return [];
  const chain: string[] = [response.url()];
  let request = response.request().redirectedFrom();
  while (request) {
    chain.unshift(request.url());
    request = request.redirectedFrom();
  }
  return chain;
}

const navigateInputSchema = z.object({ url: z.string() });

export function createNavigateTool(page: Page) {
  return createTool({
    id: "navigate",
    description:
      "Navigate the browser to a URL, refusing any private/loopback/link-local/cloud-metadata target.",
    inputSchema: navigateInputSchema,
    execute: async ({ url }) => {
      if (!(await isUrlAllowed(url))) {
        throw new SsrfDeniedError(url);
      }
      const response = await page.goto(url);
      return {
        url: page.url(),
        status: response?.status() ?? null,
        ok: response?.ok() ?? false,
        redirectChain: getRedirectChain(response),
      };
    },
  });
}

import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { Page } from "playwright";
import type { Evidence, EvidenceType } from "../../types";

const CREDENTIAL_LIKE_KEY = /pass(word)?|token|secret|api[-_]?key|auth|credential/i;
const CREDENTIAL_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie"]);
const REDACTED = "[REDACTED]";

/**
 * Masks the literal supplied-credential value wherever it appears in a string — headers, bodies,
 * or URLs (SEC-002). A no-op when no credential was supplied for this run.
 */
export function redactValue(value: string, credentialValue?: string): string {
  if (!credentialValue) return value;
  return value.split(credentialValue).join(REDACTED);
}

/**
 * Redacts header *values* for credential-bearing headers (`Authorization`/`Cookie`/`Set-Cookie`)
 * and the literal credential value in any other header — names and presence are preserved
 * (FR-006).
 */
export function redactHeaders(
  headers: Record<string, string>,
  credentialValue?: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name] = CREDENTIAL_HEADER_NAMES.has(name.toLowerCase())
      ? REDACTED
      : redactValue(value, credentialValue);
  }
  return result;
}

/**
 * Redacts request/response body fields whose *name* matches a credential-like pattern (SEC-002,
 * resolved 2026-09-04 `/speckit-clarify`) — case-insensitive keyword match on the key, not a fixed
 * exact-name allow-list — plus the literal credential value wherever it appears in a body value.
 */
export function redactBody(body: unknown, credentialValue?: string): unknown {
  if (typeof body === "string") return redactValue(body, credentialValue);
  if (Array.isArray(body)) return body.map((item) => redactBody(item, credentialValue));
  if (body && typeof body === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      result[key] = CREDENTIAL_LIKE_KEY.test(key) ? REDACTED : redactBody(value, credentialValue);
    }
    return result;
  }
  return body;
}

export interface CapturedConsoleMessage {
  type: string;
  text: string;
}

export interface CapturedNetworkEntry {
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
}

/**
 * Turns raw captured console/network/DOM records into `Evidence` objects, redacted before the
 * object exists in this form — never post-hoc (data-model.md's write-time-invariant note). Empty
 * capture categories produce no Evidence entries.
 */
export function assembleEvidence(params: {
  stepId: string | null;
  console?: CapturedConsoleMessage[];
  network?: CapturedNetworkEntry[];
  domHtml?: string;
  credentialValue?: string;
}): Evidence[] {
  const evidence: Evidence[] = [];
  const push = (type: EvidenceType, content: string, metadata: Record<string, unknown> = {}) => {
    evidence.push({ id: crypto.randomUUID(), stepId: params.stepId, type, content, metadata });
  };

  if (params.console?.length) {
    const content = params.console.map((m) => `[${m.type}] ${m.text}`).join("\n");
    push("CONSOLE", redactValue(content, params.credentialValue));
  }

  for (const entry of params.network ?? []) {
    const content = JSON.stringify(
      redactBody(
        { url: entry.url, status: entry.status, body: entry.responseBody },
        params.credentialValue,
      ),
    );
    push("NETWORK", content, {
      status: entry.status,
      requestHeaders: redactHeaders(entry.requestHeaders, params.credentialValue),
      responseHeaders: redactHeaders(entry.responseHeaders, params.credentialValue),
    });
  }

  if (params.domHtml !== undefined) {
    push("DOM", redactValue(params.domHtml, params.credentialValue));
  }

  return evidence;
}

export interface EvidenceRecorder {
  getConsoleMessages: () => CapturedConsoleMessage[];
  getNetworkEntries: () => CapturedNetworkEntry[];
  /** Awaits every in-flight response body parse — call before reading `getNetworkEntries()` so a
   * slow response that's still resolving when a step fails isn't silently dropped from evidence
   * (`/review`, 2026-09-04: `response.json()` was fire-and-forget with no way to know it was
   * still pending, which could produce an incomplete FR-005 capture). */
  waitForPendingCaptures: () => Promise<void>;
}

/**
 * Registers listeners on `page` to accumulate console/network events for the lifetime of the
 * page — must be attached before navigation (events before attachment are lost, research.md §3).
 * `collectEvidenceTool` below reads whatever has accumulated so far when a step fails.
 *
 * Redacts at capture time, inside this recorder — not only later in `assembleEvidence` — so a raw
 * credential value never sits in the accumulated arrays even transiently (`/review`, 2026-09-04:
 * the original version deferred all redaction to `assembleEvidence`, which satisfied FR-006's
 * letter — nothing unredacted ever left this module — but not the architecture research.md/
 * plan.md actually describe, and left a real footgun: any future direct reader of
 * `getNetworkEntries()`/`getConsoleMessages()` would see raw data with no type-level signal that
 * it's unsafe). `assembleEvidence`'s own redaction stays as defense-in-depth, not removed.
 */
export function createEvidenceRecorder(page: Page, credentialValue?: string): EvidenceRecorder {
  const consoleMessages: CapturedConsoleMessage[] = [];
  const networkEntries: CapturedNetworkEntry[] = [];
  const requestHeadersByUrl = new Map<string, Record<string, string>>();
  const pendingCaptures: Promise<void>[] = [];

  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: redactValue(message.text(), credentialValue) });
  });
  page.on("pageerror", (error) => {
    // Uncaught exceptions aren't delivered via the 'console' event (research.md §3).
    consoleMessages.push({ type: "pageerror", text: redactValue(error.message, credentialValue) });
  });
  page.on("request", (request) => {
    requestHeadersByUrl.set(request.url(), redactHeaders(request.headers(), credentialValue));
  });
  page.on("response", (response) => {
    const capture = response
      .json()
      .catch(() => undefined)
      .then((responseBody) => {
        networkEntries.push({
          url: response.url(),
          status: response.status(),
          requestHeaders: requestHeadersByUrl.get(response.url()) ?? {},
          responseHeaders: redactHeaders(response.headers(), credentialValue),
          responseBody: redactBody(responseBody, credentialValue),
        });
      });
    pendingCaptures.push(capture);
  });
  page.on("requestfailed", (request) => {
    // Covers failures the 'response' event never sees (research.md §3).
    networkEntries.push({
      url: request.url(),
      status: 0,
      requestHeaders: redactHeaders(request.headers(), credentialValue),
      responseHeaders: {},
      responseBody: { error: request.failure()?.errorText },
    });
  });

  return {
    getConsoleMessages: () => consoleMessages,
    getNetworkEntries: () => networkEntries,
    waitForPendingCaptures: async () => {
      await Promise.all(pendingCaptures);
    },
  };
}

const collectEvidenceInputSchema = z.object({ stepId: z.string().nullable() });

/**
 * The Evidence Collector tool a failed step invokes (FR-005). Captures DOM/console/network —
 * already accumulated by `createEvidenceRecorder` — plus the current DOM snapshot, redacted
 * inside this tool before an `Evidence` object exists in that form (FR-006, SEC-002). The
 * redirect chain is attached by the caller from `navigate.tool.ts`'s own return value, since only
 * the navigation that produced it holds the response object `getRedirectChain` needs.
 */
export function createEvidenceTool(
  page: Page,
  recorder: EvidenceRecorder,
  options: { credentialValue?: string; redirectChain?: string[] } = {},
) {
  return createTool({
    id: "collect-evidence",
    description: "Capture DOM, console, and network evidence for the current failed step.",
    inputSchema: collectEvidenceInputSchema,
    execute: async ({ stepId }) => {
      // A response's body can still be parsing when a step fails right after it — without this,
      // that network entry would silently be missing from the capture (FR-005).
      await recorder.waitForPendingCaptures();
      const domHtml = await page.content();
      const evidence = assembleEvidence({
        stepId,
        console: recorder.getConsoleMessages(),
        network: recorder.getNetworkEntries(),
        domHtml,
        credentialValue: options.credentialValue,
      });
      if (options.redirectChain?.length) {
        evidence.push({
          id: crypto.randomUUID(),
          stepId,
          type: "HTTP",
          content: JSON.stringify({ redirectChain: options.redirectChain }),
          metadata: {},
        });
      }
      return { evidence };
    },
  });
}

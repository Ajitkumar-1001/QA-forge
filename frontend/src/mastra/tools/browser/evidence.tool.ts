import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { Page } from "playwright";
import type { Evidence, EvidenceType } from "../../types";

export const CREDENTIAL_LIKE_KEY = /pass(word)?|token|secret|api[-_]?key|auth|credential/i;
const CREDENTIAL_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie"]);
const REDACTED = "[REDACTED]";

export function redactValue(value: string, credentialValue?: string): string {
  if (!credentialValue) return value;
  return value.split(credentialValue).join(REDACTED);
}

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

  durationMs?: number;
}

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
      durationMs: entry.durationMs,
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

  waitForPendingCaptures: () => Promise<void>;
}

export function createEvidenceRecorder(page: Page, credentialValue?: string): EvidenceRecorder {
  const consoleMessages: CapturedConsoleMessage[] = [];
  const networkEntries: CapturedNetworkEntry[] = [];
  const requestHeadersByUrl = new Map<string, Record<string, string>>();

  const requestStartByUrl = new Map<string, number>();
  const pendingCaptures: Promise<void>[] = [];

  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: redactValue(message.text(), credentialValue) });
  });
  page.on("pageerror", (error) => {

    consoleMessages.push({ type: "pageerror", text: redactValue(error.message, credentialValue) });
  });
  page.on("request", (request) => {
    requestHeadersByUrl.set(request.url(), redactHeaders(request.headers(), credentialValue));
    requestStartByUrl.set(request.url(), Date.now());
  });
  page.on("response", (response) => {
    const startedAt = requestStartByUrl.get(response.url());
    const durationMs = startedAt !== undefined ? Date.now() - startedAt : undefined;
    const capture = response
      .json()

      .catch(() => response.text().catch(() => undefined))
      .then((responseBody) => {
        networkEntries.push({
          url: response.url(),
          status: response.status(),
          requestHeaders: requestHeadersByUrl.get(response.url()) ?? {},
          responseHeaders: redactHeaders(response.headers(), credentialValue),
          responseBody: redactBody(responseBody, credentialValue),
          durationMs,
        });
      });
    pendingCaptures.push(capture);
  });
  page.on("requestfailed", (request) => {

    const startedAt = requestStartByUrl.get(request.url());
    networkEntries.push({
      url: request.url(),
      status: 0,
      requestHeaders: redactHeaders(request.headers(), credentialValue),
      responseHeaders: {},
      responseBody: { error: request.failure()?.errorText },
      durationMs: startedAt !== undefined ? Date.now() - startedAt : undefined,
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

      await recorder.waitForPendingCaptures();
      const domHtml = await page.content();
      const evidence = assembleEvidence({
        stepId,
        console: recorder.getConsoleMessages(),
        network: recorder.getNetworkEntries(),
        domHtml,
        credentialValue: options.credentialValue,
      });

      // ponytail: base64 PNG straight into the text column, same as every other evidence
      // type here — swap for object storage + URL if row size ever becomes a problem.
      const screenshot = await page.screenshot({ type: "png" });
      evidence.push({
        id: crypto.randomUUID(),
        stepId,
        type: "SCREENSHOT",
        content: screenshot.toString("base64"),
        metadata: { mimeType: "image/png" },
      });

      evidence.push({
        id: crypto.randomUUID(),
        stepId,
        type: "HTTP",
        content: JSON.stringify({ currentUrl: redactValue(page.url(), options.credentialValue) }),
        metadata: {},
      });
      if (options.redirectChain?.length) {

        const redactedChain = options.redirectChain.map((url) => redactValue(url, options.credentialValue));
        evidence.push({
          id: crypto.randomUUID(),
          stepId,
          type: "HTTP",
          content: JSON.stringify({ redirectChain: redactedChain }),
          metadata: {},
        });
      }
      return { evidence };
    },
  });
}

import type { Evidence, EvidenceType } from "../../types";

/**
 * PARTIAL FILE (built incrementally, TDD-first): this covers the pure, deterministic
 * redaction + assembly logic T023/T024's unit tests exercise. T031 adds the live Playwright
 * capture wrapper (page.on listeners, redirect-chain walking via redirectedFrom(), the
 * `createTool()` export) around what's already here.
 */

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
    evidence.push({ stepId: params.stepId, type, content, metadata });
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

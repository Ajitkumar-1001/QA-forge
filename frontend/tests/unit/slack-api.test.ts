import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidSlackWebhookUrl, postSlackNotification } from "@/lib/slack-api";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("isValidSlackWebhookUrl — research.md Decision 5, FR-003/FR-012", () => {
  it("accepts a genuine https hooks.slack.com URL", () => {
    expect(isValidSlackWebhookUrl("https://hooks.slack.com/services/T00/B00/xxx")).toBe(true);
  });

  it("rejects a cleartext http URL at an otherwise-genuine hostname (scheme check, follow-up review finding)", () => {
    expect(isValidSlackWebhookUrl("http://hooks.slack.com/services/T00/B00/xxx")).toBe(false);
  });

  it("rejects a non-Slack hostname", () => {
    expect(isValidSlackWebhookUrl("https://evil.example.com/webhook")).toBe(false);
  });

  it("rejects a hostname that merely contains hooks.slack.com as a substring/suffix, not an exact match", () => {
    expect(isValidSlackWebhookUrl("https://hooks.slack.com.evil.example.com/webhook")).toBe(false);
    expect(isValidSlackWebhookUrl("https://notrealhooks.slack.com/webhook")).toBe(false);
  });

  it("rejects an unparseable URL without throwing", () => {
    expect(isValidSlackWebhookUrl("not a url")).toBe(false);
  });

  it("rejects an empty string without throwing", () => {
    expect(isValidSlackWebhookUrl("")).toBe(false);
  });
});

describe("postSlackNotification — FR-008/FR-012", () => {
  it("passes an AbortSignal to fetch (10s timeout, research.md Decision 8)", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    await postSlackNotification("https://hooks.slack.com/services/T00/B00/xxx", { text: "hello" });
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("posts the payload as JSON", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    await postSlackNotification("https://hooks.slack.com/services/T00/B00/xxx", { text: "a decision needs you" });
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(capturedInit?.body as string)).toEqual({ text: "a decision needs you" });
  });

  it("a non-ok response is reported as SLACK_REJECTED", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400 }) as Response) as typeof fetch;
    const result = await postSlackNotification("https://hooks.slack.com/services/T00/B00/xxx", { text: "x" });
    expect(result).toEqual({ ok: false, reason: "SLACK_REJECTED" });
  });

  it("a network error is reported as SLACK_UNREACHABLE", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await postSlackNotification("https://hooks.slack.com/services/T00/B00/xxx", { text: "x" });
    expect(result).toEqual({ ok: false, reason: "SLACK_UNREACHABLE" });
  });

  it("a 200 response is reported as ok", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }) as Response) as typeof fetch;
    const result = await postSlackNotification("https://hooks.slack.com/services/T00/B00/xxx", { text: "x" });
    expect(result).toEqual({ ok: true });
  });
});

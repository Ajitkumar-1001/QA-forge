// 008-slack-linear-integrations: no SDK — matches github-api.ts's own precedent of raw
// fetch over an SDK's weight for a two-function surface.

/**
 * Exact scheme + hostname match, never a substring/suffix check — research.md Decision 5.
 * Immune to DNS rebinding since it never resolves the host before deciding. Never throws
 * past the caller — an unparseable URL is just "not valid," not an exception.
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

/**
 * research.md Decision 8: AbortSignal.timeout(10_000) — a deliberate deviation above
 * github-api.ts's own no-timeout precedent, justified there by the Linear write's lock-
 * holding transaction; harmless and consistent to apply here too since Slack's call is
 * scheduled via after() and never holds a lock either way.
 */
export async function postSlackNotification(
  webhookUrl: string,
  payload: { text: string },
): Promise<{ ok: true } | { ok: false; reason: "SLACK_UNREACHABLE" | "SLACK_REJECTED" }> {
  // e2e-only test seam (tests/e2e/settings.e2e.ts, approval.e2e.ts): same pattern as
  // QAFORGE_E2E_FAKE_GITHUB_API in github-api.ts — set only by the dev server under test,
  // unset in every real deployment.
  if (process.env.QAFORGE_E2E_FAKE_SLACK_WEBHOOK) {
    return JSON.parse(process.env.QAFORGE_E2E_FAKE_SLACK_WEBHOOK) as { ok: true } | { ok: false; reason: "SLACK_UNREACHABLE" | "SLACK_REJECTED" };
  }

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "SLACK_UNREACHABLE" };
  }

  if (!response.ok) {
    return { ok: false, reason: "SLACK_REJECTED" };
  }
  return { ok: true };
}

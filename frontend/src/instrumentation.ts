// SEC-008: fail fast at boot if the app-layer encryption key is missing/malformed, rather than
// booting successfully and failing (or silently writing unencrypted data) on first use. This is
// defense-in-depth for local dev / `next start` (a real persistent process to refuse) — on
// Vercel serverless there's no boot to refuse, which is why scripts/check-env.ts additionally
// gates `next build` itself (see package.json's `build` script).
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertEncryptionKeyConfigured } = await import("@/lib/crypto");
  assertEncryptionKeyConfigured();
}

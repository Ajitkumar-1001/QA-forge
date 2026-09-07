// SEC-008: validated at build/deploy time, not only at runtime boot (src/instrumentation.ts) —
// a Vercel serverless function has no persistent boot to refuse, so a misconfigured deploy can
// otherwise look "successfully deployed" until the first real sign-in attempt hits it. Chained
// into package.json's `build` script so `next build` never completes with a missing/malformed
// key.
import { assertEncryptionKeyConfigured } from "../src/lib/crypto";

try {
  assertEncryptionKeyConfigured();
} catch (error) {
  console.error("\n✗ Build-time environment check failed (SEC-008):\n");
  console.error(error instanceof Error ? error.message : error);
  console.error();
  process.exit(1);
}

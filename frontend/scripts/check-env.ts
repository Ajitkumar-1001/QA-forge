import { assertEncryptionKeyConfigured } from "../src/lib/crypto";

try {
  assertEncryptionKeyConfigured();
} catch (error) {
  console.error("\n✗ Build-time environment check failed (SEC-008):\n");
  console.error(error instanceof Error ? error.message : error);
  console.error();
  process.exit(1);
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertEncryptionKeyConfigured } = await import("@/lib/crypto");
  assertEncryptionKeyConfigured();
}

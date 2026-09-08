import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const raw = process.env.AUTH_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "AUTH_ENCRYPTION_KEY is not set (SEC-002/SEC-008). Generate one with " +
        "`openssl rand -base64 32` and set it in .env.local.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `AUTH_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (base64 of a ` +
        `256-bit key); got ${key.length}. Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

export function assertEncryptionKeyConfigured(): void {
  getEncryptionKey();
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(stored: string): string {
  const key = getEncryptionKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value: expected iv:authTag:ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

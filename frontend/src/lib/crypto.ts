import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// SEC-002: app-layer AEAD encryption for GithubConnection.patReference. AES-256-GCM is Node's
// built-in AEAD cipher (no dependency needed) with a unique random IV per encryption, per
// SEC-002's explicit bar ("a non-authenticated cipher or a reused IV satisfies the word without
// satisfying Principle IV").
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce — GCM's standard, recommended length.
const KEY_LENGTH = 32; // AES-256.

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

/**
 * SEC-008: throws the same clear error as `encrypt`/`decrypt` would, but eagerly — call this at
 * boot (src/instrumentation.ts) and at build time (scripts/check-env.ts) so a missing/malformed
 * key fails loudly before first use, not on whatever request happens to hit `encrypt`/`decrypt`
 * first.
 */
export function assertEncryptionKeyConfigured(): void {
  getEncryptionKey();
}

/**
 * Encrypts `plaintext` for storage in GithubConnection.patReference (SEC-002). Returns
 * `iv:authTag:ciphertext`, each base64 — a fresh random IV every call, never reused.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypts a value produced by `encrypt`. Throws if the auth tag doesn't verify (tampered or
 * wrong key) — GCM authentication failure, not a silent garbage decrypt.
 */
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

// T008 (research.md #8, Constitution Principle IV): Better Auth's adapter stores Session.token
// raw (verified against the installed better-auth@1.7.3: internal-adapter.mjs's createSession
// does `token: generateId(32)` with no hashing) — a DB-only leak (backup, replica, injection)
// would hand out directly-usable session tokens, bypassing the httpOnly cookie entirely.
//
// This is a one-way, deterministic hash — NOT the AEAD cipher above, and deliberately not a slow
// password hash (bcrypt/scrypt/argon2): a session token is already a high-entropy random 32-char
// ID, not a low-entropy human password, so it needs no brute-force-resistant slowness — only an
// exact-match lookup, which a fast deterministic digest supports directly (SHA-256 here; the
// same reasoning GitHub and similar providers apply to hashing API/PAT tokens at rest).
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, hashSessionToken } from "@/lib/crypto";

beforeEach(() => {
  process.env.AUTH_ENCRYPTION_KEY = require("node:crypto").randomBytes(32).toString("base64");
});

describe("encrypt/decrypt — AEAD for GithubConnection.patReference (SEC-002)", () => {
  it("round-trips a plaintext value", () => {
    const plaintext = "ghp_exampleSecretToken1234567890";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("uses a unique IV per encryption — two calls on the same plaintext never match", () => {
    const plaintext = "same-secret";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("throws on a tampered ciphertext rather than decrypting silently", () => {
    const [iv, tag] = encrypt("some-secret").split(":");
    const tampered = [iv, tag, Buffer.from("not the real ciphertext").toString("base64")].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on a malformed stored value", () => {
    expect(() => decrypt("not-the-right-shape")).toThrow();
  });

  it("throws when AUTH_ENCRYPTION_KEY is unset (SEC-008 defense-in-depth)", () => {
    delete process.env.AUTH_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow();
  });

  it("throws when AUTH_ENCRYPTION_KEY is the wrong length", () => {
    process.env.AUTH_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encrypt("x")).toThrow();
  });
});

describe("hashSessionToken — Session.token hashed before storage (T008, Constitution Principle IV)", () => {
  it("is deterministic", () => {
    expect(hashSessionToken("abc123")).toBe(hashSessionToken("abc123"));
  });

  it("produces different digests for different inputs", () => {
    expect(hashSessionToken("abc123")).not.toBe(hashSessionToken("different"));
  });

  it("returns a 64-character hex SHA-256 digest", () => {
    expect(hashSessionToken("abc123")).toMatch(/^[0-9a-f]{64}$/);
  });
});

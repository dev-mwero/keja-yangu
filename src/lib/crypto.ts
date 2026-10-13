import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level encryption for at-rest PII (currently the national ID).
 *
 * Values are stored as `enc:v1:<base64(iv | authTag | ciphertext)>` using
 * AES-256-GCM with a random 96-bit IV per value. Encryption is
 * non-deterministic, which is fine because encrypted fields are never used in
 * queries or equality checks (they are not indexed).
 *
 * The format is versioned so the algorithm can change later without a flag
 * day. Values that do not carry the `enc:v1:` prefix are treated as legacy
 * plaintext and returned as-is on read, so existing rows keep working until a
 * backfill encrypts them.
 */

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (raw) {
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes (base64 or 64-char hex)");
    }
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FIELD_ENCRYPTION_KEY is not set");
  }
  // Deterministic dev/test key so fixtures and local data stay stable.
  return createHash("sha256").update("keja-dev-field-encryption-key").digest();
}

/** Encrypts a value for storage. Empty strings and already-encrypted values pass through. */
export function encryptField(value: string): string {
  if (!value || isEncrypted(value)) return value;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

/** Decrypts a stored value. Legacy plaintext (no prefix) is returned unchanged. */
export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Malformed encrypted value");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

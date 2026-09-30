/**
 * Application-level field encryption (AES-256-GCM), used because this
 * environment's MariaDB build has no keyring/encryption plugin available
 * (confirmed directly: `SHOW PLUGINS` returns nothing matching
 * encrypt/keyring on this XAMPP install) -- real InnoDB tablespace
 * encryption (TDE) is off the table, so encryption happens here instead.
 *
 * Applied to a small, deliberate target set, not every string column:
 * `Transaction.counterpartyName`/`counterpartyCertNumber` and
 * `PhysicalDocument.issuedBy`/`fileReference`. Deliberately NOT applied to
 * `PhysicalDocument.documentNumber` despite looking like a similar target --
 * it's `@unique`, and AES-GCM's random IV means the same plaintext encrypts
 * to different ciphertext every time, which would silently break that
 * constraint (two identical document numbers would stop colliding). Making
 * that field's uniqueness check work under encryption would need a second,
 * deterministic "blind index" column purely for lookups -- real added
 * complexity for a field that's closer to a traceability reference than a
 * confidentiality target, so left as plaintext and flagged as a possible
 * future extension rather than done here.
 */

import crypto from "node:crypto";

const VERSION_PREFIX = "v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes, standard for GCM
const KEY_LENGTH = 32; // bytes, AES-256

function loadKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FIELD_ENCRYPTION_KEY is not set. Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
          "and set it in the environment before starting the server -- encrypted fields cannot be written or read without it."
      );
    }
    // Dev-only fallback so local setup doesn't require a manual step before
    // the app can even start. Loud on purpose -- this must never be relied
    // on outside a throwaway dev database.
    // eslint-disable-next-line no-console
    console.warn(
      "[fieldEncryption] FIELD_ENCRYPTION_KEY is not set -- using an insecure dev-only fallback key. " +
        "Set FIELD_ENCRYPTION_KEY in .env before this touches anything but a throwaway dev database."
    );
    return crypto.createHash("sha256").update("dev-only-insecure-field-encryption-key").digest();
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must base64-decode to exactly ${KEY_LENGTH} bytes (got ${key.length}). ` +
        "Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`."
    );
  }
  return key;
}

// Lazy so a missing/invalid key only breaks the request that actually needs
// encryption, not every other route at process boot.
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

/** Encrypts a string field. Returns null/undefined unchanged (nothing to
 * encrypt) so call sites can pass optional fields straight through. */
export function encryptField(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decrypts a value produced by `encryptField`. Any value that doesn't
 * start with the version prefix is assumed to be legacy plaintext (rows
 * written before this feature existed) and is returned unchanged -- there
 * is deliberately no forced one-off migration of already-seeded data. */
export function decryptField(stored: string | null | undefined): string | null | undefined {
  if (stored === null || stored === undefined) return stored;
  if (!stored.startsWith(VERSION_PREFIX)) return stored;

  const parts = stored.slice(VERSION_PREFIX.length).split(":");
  if (parts.length !== 3) return stored; // malformed -- don't crash a read over it
  const [ivB64, authTagB64, ciphertextB64] = parts;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Wrong key, corrupted value, etc. -- surface as-is rather than throw,
    // so one bad row doesn't take down an entire list endpoint.
    return stored;
  }
}

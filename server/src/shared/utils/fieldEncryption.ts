/**
 * Field-level encryption for regulated PII (SECURITY_PRINCIPLES.md §7/§8).
 *
 * Sensitive identifiers — a foreign worker's passport number and medical-insurance
 * policy number — are encrypted AT REST with AES-256-GCM, an authenticated cipher:
 * GCM detects tampering (a modified ciphertext fails decryption rather than
 * yielding garbage plaintext). A fresh random 96-bit IV is generated per value, so
 * the same plaintext never produces the same ciphertext (no equality leakage) — a
 * deliberate trade-off that makes these columns non-searchable, which is acceptable
 * for the two identifier fields.
 *
 * Stored format is a single self-describing string: `base64(iv).base64(authTag).base64(ciphertext)`
 * so the IV/tag travel with the ciphertext and no separate columns are needed.
 *
 * The key comes from `FIELD_ENCRYPTION_KEY` (64 hex chars = 32 bytes). It is
 * validated at boot (`shared/config/env.ts`) but re-read and re-validated here at
 * call time so a misconfiguration fails closed with a 500 rather than corrupting
 * data. The key value is NEVER logged or included in an error message (§18).
 */

import crypto from 'crypto';
import { AppError } from '../errors/AppError';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce (GCM standard)
const KEY_HEX_LENGTH = KEY_BYTES * 2;

/**
 * Resolve and validate the 32-byte key from `FIELD_ENCRYPTION_KEY`. Throws a
 * generic 500 (never echoing the value) if the key is absent or malformed — the
 * cipher must fail closed rather than operate with an invalid key.
 */
function getKey(): Buffer {
  const hex = process.env['FIELD_ENCRYPTION_KEY'];
  if (!hex || hex.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    // Message names the variable but never its value (§18).
    throw new AppError('FIELD_ENCRYPTION_KEY is missing or invalid', 500);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext identifier for storage. Returns the packed
 * `iv.tag.ciphertext` (base64 parts) string written to a `*Enc` column.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

/**
 * Decrypt a value produced by {@link encryptField}. Throws a generic 500 if the
 * stored value is malformed or fails the GCM authentication check (tampering /
 * wrong key) — we never return unverified plaintext.
 */
export function decryptField(stored: string): string {
  const key = getKey();
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new AppError('Encrypted field is malformed', 500);
  }
  const [ivB64, tagB64, dataB64] = parts;
  try {
    const iv = Buffer.from(ivB64!, 'base64');
    const authTag = Buffer.from(tagB64!, 'base64');
    const ciphertext = Buffer.from(dataB64!, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or tampered ciphertext — fail closed, never leak details.
    throw new AppError('Encrypted field could not be decrypted', 500);
  }
}

const TAG_BYTES = 16; // GCM auth tag length

/**
 * Encrypt a binary buffer for at-rest storage (used by the local file-storage
 * backend for regulated identity-document files, §8/§16). Uses the same
 * AES-256-GCM key as the field helpers. Output is a single self-describing
 * buffer: `iv(12) || authTag(16) || ciphertext`.
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a buffer produced by {@link encryptBuffer}. Throws a generic 500 if the
 * stored blob is malformed or fails the GCM authentication check (tampering /
 * wrong key) — we never return unverified plaintext.
 */
export function decryptBuffer(stored: Buffer): Buffer {
  const key = getKey();
  if (stored.length < IV_BYTES + TAG_BYTES) {
    throw new AppError('Encrypted file is malformed', 500);
  }
  const iv = stored.subarray(0, IV_BYTES);
  const authTag = stored.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = stored.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new AppError('Encrypted file could not be decrypted', 500);
  }
}

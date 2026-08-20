/**
 * Field-level symmetric encryption for reversible secrets at rest
 * (SECURITY_PRINCIPLES.md §8). Used for the TOTP shared secret, which — unlike
 * refresh/reset tokens — must be RECOVERABLE (not one-way hashed) to verify codes.
 *
 * AES-256-GCM (authenticated encryption): each value gets a random 12-byte IV and
 * a 16-byte auth tag, so ciphertext is non-deterministic and tamper-evident. The
 * key is derived by SHA-256 of `MFA_ENCRYPTION_KEY` (→ exactly 32 bytes), so any
 * sufficiently strong passphrase works. Startup config validation (config/env.ts)
 * enforces a strong, non-placeholder key in production. The key is read lazily
 * (env may be populated after import, mirroring the logger) and NEVER logged.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const DEV_FALLBACK_KEY = 'dev-mfa-encryption-key-not-for-production';

function deriveKey(): Buffer {
  const raw = process.env['MFA_ENCRYPTION_KEY'] ?? DEV_FALLBACK_KEY;
  return createHash('sha256').update(raw).digest(); // always 32 bytes
}

/** Encrypt a UTF-8 string → `ivB64:tagB64:ciphertextB64`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypt a value produced by `encryptSecret`. Throws if the blob is malformed or
 * the auth tag does not verify (tampering / wrong key) — callers treat a throw as
 * "secret unavailable" and fail closed.
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('malformed encrypted secret');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

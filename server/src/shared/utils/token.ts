/**
 * Account-lifecycle token primitives (SECURITY_PRINCIPLES.md §3/§7/§18).
 *
 * A lifecycle token (invitation / password-reset) is a cryptographically random
 * 256-bit value. Only its SHA-256 hash is ever stored (`AccountToken.tokenHash`);
 * the raw hex is delivered to the user out-of-band and NEVER persisted or logged.
 *
 * SHA-256 — not bcrypt — is the correct choice here: the token already carries
 * 256 bits of entropy, so it is not brute-forceable, and a fast hash lets us look
 * it up by an indexed unique column. bcrypt is for LOW-entropy secrets (passwords).
 */

import crypto from 'crypto';

/** Bytes of entropy in a raw token (256-bit → 64 hex chars). */
const TOKEN_BYTES = 32;

/** Generate a raw, single-use token. Delivered to the user; never stored. */
export function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/** Hash a raw token for storage/lookup. Deterministic SHA-256 hex digest. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

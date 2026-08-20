/**
 * MFA recovery codes (SECURITY_PRINCIPLES.md §3/§18). Single-use backup codes for
 * when the authenticator device is unavailable. Plaintext codes are shown to the
 * user exactly ONCE at enrollment; only their SHA-256 hashes are stored (one-way,
 * like account/refresh tokens), and each is consumed on use.
 */

import { randomBytes } from 'crypto';
import { hashToken } from './token';

const DEFAULT_COUNT = 10;
const BYTES_PER_CODE = 5; // 5 bytes → 10 hex chars, formatted "XXXXX-XXXXX"

/** Normalize for hashing/compare: trim, uppercase, strip separators/whitespace. */
function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

/** Generate `n` human-friendly plaintext recovery codes (shown once). */
export function generateRecoveryCodes(n: number = DEFAULT_COUNT): string[] {
  return Array.from({ length: n }, () => {
    const hex = randomBytes(BYTES_PER_CODE).toString('hex').toUpperCase();
    return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;
  });
}

/** Deterministic hash for storing/looking up a recovery code (format-insensitive). */
export function hashRecoveryCode(code: string): string {
  return hashToken(normalize(code));
}

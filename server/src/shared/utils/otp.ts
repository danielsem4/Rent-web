/**
 * Email OTP primitives (SECURITY_PRINCIPLES.md §3/§24).
 *
 * A login second-factor code is a short numeric value delivered by email. Only its
 * SHA-256 hash is ever stored (`User.mfaCodeHash`); the plaintext is emailed and
 * NEVER persisted or logged in production. The code is low-value on its own (it is
 * single-use, expiring, attempt-limited, and rate-limited), but we still hash at
 * rest and compare in constant time to avoid leaking it via the DB or timing.
 */

import crypto from 'crypto';
import { hashToken } from './token';

/** How many decimal digits the emailed code has. */
export const OTP_LENGTH = 6;

/** How long an emailed code stays valid. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Wrong-attempt cap before the current code is invalidated (forcing a resend). */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a zero-padded numeric OTP using a uniform, bias-free CSPRNG draw
 * (`crypto.randomInt` is uniform over its range — no modulo bias).
 */
export function generateNumericOtp(length: number = OTP_LENGTH): string {
  const max = 10 ** length;
  return crypto.randomInt(0, max).toString().padStart(length, '0');
}

/** SHA-256 hex hash of a code, for storage/lookup (same scheme as lifecycle tokens). */
export function hashOtp(code: string): string {
  return hashToken(code);
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyOtp(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(code), 'utf8');
  const expected = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

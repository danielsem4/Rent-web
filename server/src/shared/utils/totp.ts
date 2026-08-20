/**
 * TOTP (RFC 6238) helper — a thin wrapper over the maintained `otplib` library
 * (SECURITY_PRINCIPLES.md §3: TOTP is the sanctioned MFA mechanism; §29: use
 * established primitives, never hand-roll crypto). Isolated here so the library
 * is swappable and unit-testable, and so a single `window` policy applies.
 */

import { authenticator } from 'otplib';

/** Human-facing issuer shown in the authenticator app. */
const TOTP_ISSUER = 'rent+';

// Allow ±1 time-step (±30s) of clock skew between server and authenticator app —
// the standard tolerance. Wider windows weaken the second factor.
authenticator.options = { window: 1 };

/** Generate a new base32 TOTP shared secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Build the `otpauth://` provisioning URI encoded into the setup QR code. */
export function buildOtpAuthUrl(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, TOTP_ISSUER, secret);
}

/**
 * Verify a 6-digit TOTP code against the secret, tolerating ±1 step of skew.
 * Returns false (never throws) for malformed input.
 */
export function verifyTotp(code: string, secret: string): boolean {
  try {
    return authenticator.check(code.trim(), secret);
  } catch {
    return false;
  }
}

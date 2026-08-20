/**
 * Short-lived, single-purpose MFA tokens (SECURITY_PRINCIPLES.md §3/§24).
 *
 * Issued after the first factor (credentials) to authorize ONLY the MFA second
 * step (challenge or enrollment). They use a DISTINCT audience (`JWT_MFA_AUDIENCE`)
 * so the primary `authenticate` middleware — which pins `JWT_AUDIENCE` — can never
 * accept one as an access token, plus an explicit `purpose` claim verified here.
 * Shared by `AuthService` and the enrollment guard so signing/verification cannot
 * drift apart.
 */

import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import {
  MFA_TOKEN_TTL,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_MFA_AUDIENCE,
} from '../config/jwt';

export type MfaPurpose = 'mfa_challenge' | 'mfa_enroll';

function secret(): string {
  const value = process.env['JWT_SECRET'];
  if (!value) {
    throw new AppError('JWT_SECRET is not configured', 500);
  }
  return value;
}

export function signMfaToken(userId: number, purpose: MfaPurpose): string {
  return jwt.sign({ userId, purpose }, secret(), {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_MFA_AUDIENCE,
    expiresIn: MFA_TOKEN_TTL,
  });
}

/** Verify signature/audience/expiry + required purpose → userId. Throws 401 otherwise. */
export function verifyMfaToken(token: string, expectedPurpose: MfaPurpose): number {
  try {
    const payload = jwt.verify(token, secret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_MFA_AUDIENCE,
    }) as { userId?: number; purpose?: string };
    if (payload.purpose !== expectedPurpose || typeof payload.userId !== 'number') {
      throw new AppError('Invalid or expired MFA token', 401);
    }
    return payload.userId;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired MFA token', 401);
  }
}

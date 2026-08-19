import type { Algorithm } from 'jsonwebtoken';

/**
 * Centralized JWT / session policy values (SECURITY_PRINCIPLES.md §28).
 *
 * These are the single source of truth for the token format and lifetime. Both
 * `AuthService.sign` and the `authenticate` middleware read from here so signing
 * and verification can never drift apart.
 *
 * Token architecture is JWT (approved — SECURITY_PRINCIPLES.md §4). Immediate
 * revocation is provided by the server-side `tokenVersion` + `isActive` checks in
 * `authenticate`, NOT by a short TTL. Short-lived access tokens + refresh-token
 * rotation are a separate, future batch.
 */

/** Access-token lifetime. Kept at 8h this batch (see §4 rationale above). */
export const ACCESS_TOKEN_TTL = '8h';

/** Access-token lifetime in milliseconds — used for the auth cookie `maxAge`. */
export const ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/** The only signing algorithm we issue and the only one we accept on verify. */
export const JWT_ALGORITHM: Algorithm = 'HS256';

/** Issuer/audience claims — set on sign and strictly validated on verify. */
export const JWT_ISSUER = 'rentplus';
export const JWT_AUDIENCE = 'rentplus-app';

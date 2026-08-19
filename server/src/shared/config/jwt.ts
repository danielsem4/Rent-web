import type { Algorithm } from 'jsonwebtoken';

/**
 * Centralized JWT / session policy values (SECURITY_PRINCIPLES.md §28).
 *
 * These are the single source of truth for the token format and lifetime. Both
 * `AuthService.sign` and the `authenticate` middleware read from here so signing
 * and verification can never drift apart.
 *
 * Token architecture is JWT (approved — SECURITY_PRINCIPLES.md §4). The access
 * token is now SHORT-LIVED (15m); continuity comes from a stateful, rotating
 * refresh token (`RefreshToken` model + `/api/auth/refresh`, Batch 5). Immediate
 * revocation is still provided by the server-side `tokenVersion` + `isActive`
 * checks in `authenticate` and by refresh-token family revocation.
 */

/** Access-token lifetime (SECURITY_PRINCIPLES.md §4/§28) — short-lived. */
export const ACCESS_TOKEN_TTL = '15m';

/** Access-token lifetime in milliseconds — used for the auth cookie `maxAge`. */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Refresh-token lifetime in milliseconds (SECURITY_PRINCIPLES.md §4/§28) — the
 * absolute session lifetime. Used for the refresh cookie `maxAge` and the
 * `RefreshToken.expiresAt` row. Rotated on every use; reuse revokes the family.
 */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The only signing algorithm we issue and the only one we accept on verify. */
export const JWT_ALGORITHM: Algorithm = 'HS256';

/** Issuer/audience claims — set on sign and strictly validated on verify. */
export const JWT_ISSUER = 'rentplus';
export const JWT_AUDIENCE = 'rentplus-app';

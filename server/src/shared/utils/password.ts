/**
 * Centralized password hashing (SECURITY_PRINCIPLES.md §3/§28).
 *
 * bcrypt is the project's password hash; the cost factor lives here as the single
 * reviewable source of truth so it is never a scattered magic number. Verification
 * stays inline at the login call site (`auth.service.ts` `bcrypt.compare`).
 */

import bcrypt from 'bcrypt';

/** bcrypt cost factor. Changing it is a reviewable security-policy change (§28). */
export const PASSWORD_SALT_ROUNDS = 10;

/** Hash a plaintext password for storage. Never log the input or the result. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, PASSWORD_SALT_ROUNDS);
}

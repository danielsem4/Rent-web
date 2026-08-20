import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * A submitted MFA code: a 6-digit TOTP OR a recovery code. Kept permissive on
 * exact shape (length 6-32, alphanumeric + dashes) so both forms validate; the
 * service does the authoritative TOTP/recovery verification.
 */
const mfaCodeSchema = z
  .string()
  .trim()
  .min(6, 'A valid authentication code is required')
  .max(32, 'A valid authentication code is required');

/** POST /api/auth/mfa/challenge — second-factor login step. */
export const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  code: mfaCodeSchema,
});
export type MfaChallengeDto = z.infer<typeof mfaChallengeSchema>;

/**
 * POST /api/auth/mfa/verify-setup — enable MFA. `mfaToken` is present only during
 * mid-login (enroll-token) enrollment; absent when an already-authenticated user
 * enrolls voluntarily (the session cookie authorizes them).
 */
export const mfaVerifySetupSchema = z.object({
  code: mfaCodeSchema,
  mfaToken: z.string().min(1).optional(),
});
export type MfaVerifySetupDto = z.infer<typeof mfaVerifySetupSchema>;

/** POST /api/auth/mfa/disable — step-up with current password OR a TOTP code. */
export const mfaDisableSchema = z
  .object({
    password: z.string().min(1).optional(),
    code: mfaCodeSchema.optional(),
  })
  .refine((v) => v.password !== undefined || v.code !== undefined, {
    message: 'A current password or authentication code is required',
  });
export type MfaDisableDto = z.infer<typeof mfaDisableSchema>;

/** POST /api/auth/mfa/setup — no body; optional enroll token during mid-login. */
export const mfaSetupSchema = z.object({
  mfaToken: z.string().min(1).optional(),
});
export type MfaSetupDto = z.infer<typeof mfaSetupSchema>;

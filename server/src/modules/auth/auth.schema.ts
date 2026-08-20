import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

/** A submitted email-OTP code: exactly 6 digits. The service does the authoritative
 * hash/expiry/attempt verification; this only rejects obviously malformed input. */
const mfaCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'A valid 6-digit authentication code is required');

/** POST /api/auth/mfa/challenge — second-factor login step. */
export const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  code: mfaCodeSchema,
});
export type MfaChallengeDto = z.infer<typeof mfaChallengeSchema>;

/** POST /api/auth/mfa/resend — re-send the emailed code for a pending challenge. */
export const mfaResendSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
});
export type MfaResendDto = z.infer<typeof mfaResendSchema>;

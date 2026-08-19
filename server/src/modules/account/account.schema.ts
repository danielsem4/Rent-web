import { z } from 'zod';

/**
 * Password strength policy (SECURITY_PRINCIPLES.md §10/§28), centralized so every
 * password-setting surface shares one rule. A modest strengthening over the prior
 * length-only `min(8)`: at least 8 chars AND at least one letter and one digit.
 * (Breached-password checks / full complexity remain a tracked P2 maturity item.)
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/** POST /api/auth/invitation/accept — set the first password with an invite token. */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

/** POST /api/auth/forgot-password — request a reset link (enumeration-safe). */
export const forgotPasswordSchema = z.object({
  email: z.string().email('A valid email is required'),
});

/** POST /api/auth/reset-password — set a new password with a reset token. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

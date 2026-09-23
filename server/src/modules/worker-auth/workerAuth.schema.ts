import { z } from 'zod';
import { OTP_LENGTH } from '../../shared/utils/otp';

/**
 * Zod schemas for the foreign-worker login module (SECURITY_PRINCIPLES.md §10).
 * Non-strict by project convention, so unknown keys are stripped. The login
 * identifier is the QR token (from a scan) or the phone number (typed) — the client
 * re-supplies it on verify/resend, so no server-side challenge state is needed and
 * the responses reveal nothing about which numbers are registered (enumeration-safe).
 */

// A raw QR token is a 256-bit hex value (64 chars); accept a generous range so a
// slightly different encoding still validates, but bound it to avoid abuse.
const qrToken = z.string().min(16).max(256);
// Phone as typed by the worker; normalized to E.164 in the service. Bounded length.
const phone = z.string().min(3).max(32);
// The WhatsApp OTP — exactly OTP_LENGTH digits.
const code = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'Invalid code');

/** Body for POST /api/worker-auth/qr/start. */
export const qrStartSchema = z.object({ qrToken });

/** Body for POST /api/worker-auth/phone/start. */
export const phoneStartSchema = z.object({ phone });

/**
 * Identifier for verify/resend: EXACTLY ONE of `qrToken` / `phone`. Refined so a
 * request supplying both or neither is rejected before it reaches the service.
 */
const identifierShape = {
  qrToken: qrToken.optional(),
  phone: phone.optional(),
};
function exactlyOneIdentifier(data: { qrToken?: string; phone?: string }): boolean {
  return (data.qrToken != null) !== (data.phone != null);
}
const IDENTIFIER_MESSAGE = 'Provide exactly one of qrToken or phone';

/** Body for POST /api/worker-auth/verify. */
export const verifySchema = z
  .object({ ...identifierShape, code })
  .refine(exactlyOneIdentifier, { message: IDENTIFIER_MESSAGE });

/** Body for POST /api/worker-auth/otp/resend. */
export const resendSchema = z
  .object(identifierShape)
  .refine(exactlyOneIdentifier, { message: IDENTIFIER_MESSAGE });

/**
 * Body for POST /api/worker-auth/refresh and /logout. The worker session is
 * Bearer-transported (no cookies), so the rotating refresh token travels in the
 * request body, kept by the native app in secure storage.
 */
export const refreshSchema = z.object({ refreshToken: z.string().min(16).max(256) });

export type QrStartDto = z.infer<typeof qrStartSchema>;
export type PhoneStartDto = z.infer<typeof phoneStartSchema>;
export type VerifyDto = z.infer<typeof verifySchema>;
export type ResendDto = z.infer<typeof resendSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;

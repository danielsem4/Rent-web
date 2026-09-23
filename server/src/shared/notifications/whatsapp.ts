/**
 * WhatsApp delivery seam (SECURITY_PRINCIPLES.md §3/§7/§18/§24).
 *
 * The foreign-worker login flow sends a short numeric OTP over WhatsApp. Delivering
 * it is a MESSAGING-provider concern; this interface is the seam (mirroring the
 * mailer seam in `mailer.ts`). Services depend on the interface and the concrete
 * sender is injected via manual DI in the router.
 *
 * Binding rule: the raw code must NEVER appear in production logs (§7/§18). The
 * console implementation prints ONLY outside production, as a local-dev affordance
 * for exercising the flow by hand; in production it refuses to "deliver" (fail
 * closed) until a real provider is wired. A real provider (Meta WhatsApp Cloud API
 * or Twilio) is added later behind this same interface — see `ProviderWhatsAppSender`.
 *
 * NOTE (§2, deployment): sending a phone number + OTP to a WhatsApp provider is a
 * NEW third-party data egress and requires a pre-approved authentication message
 * TEMPLATE with the provider. That is a delivery dependency, not a reason to weaken
 * the OTP requirement.
 */

import { logger } from '../logging/logger';
import type { WhatsAppConfig } from '../config/env';

export interface IWhatsAppSender {
  /**
   * Deliver a login second-factor (OTP) code to a WhatsApp number in E.164 form.
   * The plaintext code must never be persisted or logged in production.
   */
  sendOtp(toPhoneE164: string, code: string): Promise<void>;
}

/**
 * Development sender: logs the code to the console so a developer can complete the
 * flow by hand. Gated strictly on `NODE_ENV !== 'production'` so a raw code can
 * never reach production logs. In production it throws — no real provider is wired,
 * and we fail closed rather than silently dropping the code.
 */
export class ConsoleWhatsAppSender implements IWhatsAppSender {
  sendOtp(toPhoneE164: string, code: string): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      // Fail closed: no provider configured and we will not log the code.
      throw new Error('No WhatsApp provider configured for OTP delivery');
    }
    // Dev-only affordance: surface the OTP prominently so it can be used to complete
    // login by hand. Logged at WARN (always visible in dev, survives a raised
    // LOG_LEVEL). The phone is truncated — even in dev we avoid a full number in logs.
    const masked = maskPhone(toPhoneE164);
    logger.warn(`══ DEV WORKER OTP ══ ${masked} → ${code} (valid 10 min)`);
    return Promise.resolve();
  }
}

/**
 * Production sender: delivers the OTP via a real WhatsApp provider. Constructed only
 * when WhatsApp is fully configured (`config/env.ts`). This is a STUB seam — the
 * concrete HTTP call to Meta's Cloud API / Twilio (with the approved auth template)
 * is wired when a provider account exists. It never logs the code.
 */
export class ProviderWhatsAppSender implements IWhatsAppSender {
  constructor(private readonly config: WhatsAppConfig) {}

  sendOtp(_toPhoneE164: string, _code: string): Promise<void> {
    // Wire the provider HTTP request here (Meta Cloud API `/{phoneNumberId}/messages`
    // with the approved authentication template, or Twilio). Until then, fail closed
    // so a misconfigured production deploy never silently drops the OTP.
    void this.config;
    return Promise.reject(
      new Error('WhatsApp provider integration is not yet implemented'),
    );
  }
}

/** Redact all but the last 3 digits of an E.164 number for safe dev logging. */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return '***';
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

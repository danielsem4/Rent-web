/**
 * Mail delivery seam (SECURITY_PRINCIPLES.md §3/§7/§18/§24).
 *
 * Invitations / password-resets carry a raw single-use token in a link; the
 * email-OTP 2FA flow sends a short numeric code. Delivering these is an
 * EMAIL-provider concern. This interface is the seam; services depend on the
 * interface and the concrete mailer is injected via manual DI in the router
 * (mirroring the repository-interface convention).
 *
 * Binding rule: a raw token/code must NEVER appear in production logs (§7/§18).
 * The console implementation prints ONLY outside production, as a local-dev
 * affordance for exercising the flow by hand; in production it refuses to
 * "deliver" (fail closed) until a real provider is wired. The SMTP implementation
 * sends real mail via nodemailer and never logs the secret.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../logging/logger';
import type { SmtpConfig } from '../config/env';

export interface AccountMailer {
  /** Deliver an invitation (set-password) link to a newly provisioned user. */
  sendInvitation(to: string, link: string): Promise<void>;
  /** Deliver a password-reset link. */
  sendPasswordReset(to: string, link: string): Promise<void>;
  /** Deliver a login second-factor (email OTP) code. */
  sendMfaCode(to: string, code: string): Promise<void>;
}

/**
 * Development mailer: logs the payload to the console so a developer can complete
 * the flow by hand. Gated strictly on `NODE_ENV !== 'production'` so a raw token /
 * code can never reach production logs. In production it throws — no real provider
 * is wired, and we fail closed rather than silently dropping the secret.
 */
export class ConsoleAccountMailer implements AccountMailer {
  private deliver(kind: string, to: string, payload: Record<string, string>): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      // Fail closed: no provider configured and we will not log the secret.
      throw new Error('No email provider configured for mail delivery');
    }
    // Dev-only: safe to surface the payload locally to complete the flow by hand.
    // This branch is unreachable in production (guarded above).
    logger.info('dev_mail', { kind, to, ...payload });
    return Promise.resolve();
  }

  sendInvitation(to: string, link: string): Promise<void> {
    return this.deliver('invitation', to, { link });
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.deliver('password-reset', to, { link });
  }

  sendMfaCode(to: string, code: string): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      // Fail closed: no provider configured and we will not log the code.
      throw new Error('No email provider configured for mail delivery');
    }
    // Dev-only affordance: surface the 2FA code prominently so it can be used to
    // complete login by hand. Logged at WARN (always visible in dev, survives a
    // raised LOG_LEVEL) with the code in the message string (never key-redacted).
    logger.warn(`══ DEV MFA CODE ══ ${to} → ${code} (valid 10 min)`);
    return Promise.resolve();
  }
}

/**
 * Production mailer: delivers real email via SMTP (nodemailer). Constructed only
 * when SMTP is fully configured (`config/env.ts`). Never logs the token/code.
 */
export class SmtpAccountMailer implements AccountMailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(smtp: SmtpConfig) {
    this.from = smtp.from;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }

  sendInvitation(to: string, link: string): Promise<void> {
    return this.send(to, 'Your rent+ invitation', `Set your password: ${link}`);
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.send(to, 'Reset your rent+ password', `Reset your password: ${link}`);
  }

  sendMfaCode(to: string, code: string): Promise<void> {
    return this.send(
      to,
      'Your rent+ verification code',
      `Your verification code is ${code}. It expires in 10 minutes. If you did not try to sign in, ignore this email.`,
    );
  }
}

/**
 * Account-mail delivery seam (SECURITY_PRINCIPLES.md §3/§7/§18/§24).
 *
 * Invitation and password-reset links carry the raw single-use token. Delivering
 * them is an EMAIL-provider concern; no provider is chosen yet (an open decision —
 * `SECURITY_GAP_ANALYSIS.md` §7). This interface is the seam a real provider will
 * implement; services depend on the interface, and the concrete mailer is injected
 * via manual DI in the router (mirroring the repository-interface convention).
 *
 * Binding rule: a raw token must NEVER appear in production logs (§7/§18). The
 * console implementation therefore prints the link ONLY outside production, as a
 * local-dev affordance for manually exercising the flow; in production it refuses
 * to "deliver" (fail closed) until a real provider is wired.
 */

import { logger } from '../logging/logger';

export interface AccountMailer {
  /** Deliver an invitation (set-password) link to a newly provisioned user. */
  sendInvitation(to: string, link: string): Promise<void>;
  /** Deliver a password-reset link. */
  sendPasswordReset(to: string, link: string): Promise<void>;
}

/**
 * Development mailer: logs the link to the console so a developer can complete the
 * flow by hand. Gated strictly on `NODE_ENV !== 'production'` so a raw token can
 * never reach production logs. In production it throws — no real provider is wired,
 * and we fail closed rather than silently dropping (or worse, logging) the token.
 */
export class ConsoleAccountMailer implements AccountMailer {
  private deliver(kind: string, to: string, link: string): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      // Fail closed: no provider configured and we will not log the token.
      throw new Error('No email provider configured for account mail delivery');
    }
    // Dev-only: safe to surface the link locally to complete the flow by hand.
    // The link carries the raw token BY DESIGN here (this branch is unreachable
    // in production, guarded above) — it is the whole point of the dev mailer.
    logger.info('dev_mail', { kind, to, link });
    return Promise.resolve();
  }

  sendInvitation(to: string, link: string): Promise<void> {
    return this.deliver('invitation', to, link);
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.deliver('password-reset', to, link);
  }
}

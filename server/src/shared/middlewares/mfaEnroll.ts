import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { authenticate } from './authenticate';
import { verifyMfaToken } from '../utils/mfaToken';

/**
 * Authorize the MFA enrollment endpoints (`/mfa/setup`, `/mfa/verify-setup`) via
 * EITHER a normal access session OR a short-lived `mfa_enroll` token
 * (SECURITY_PRINCIPLES.md §3/§24). The enroll-token path exists because a
 * privileged user is hard-gated: they hold no session until enrollment completes,
 * so the enroll token (issued by `login`) is their only credential to reach setup.
 *
 * Sets `req.mfaUserId` and `req.mfaEnrollMode` (true = authorized by an enroll
 * token mid-login, so verify-setup should issue a session; false = an already
 * authenticated user enrolling voluntarily). Fails closed with 401 otherwise.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      mfaUserId?: number;
      mfaEnrollMode?: boolean;
    }
  }
}

export function authenticateOrEnrollToken(req: Request, res: Response, next: NextFunction): void {
  // Try a normal access session first, reusing `authenticate` (no logic duplicated).
  void authenticate(req, res, (err?: unknown) => {
    if (!err && req.currentUser) {
      req.mfaUserId = req.currentUser.userId;
      req.mfaEnrollMode = false;
      next();
      return;
    }
    // No valid session — accept a single-purpose enroll token from the body.
    const enrollToken = (req.body as { mfaToken?: unknown } | undefined)?.mfaToken;
    if (typeof enrollToken === 'string' && enrollToken.length > 0) {
      try {
        req.mfaUserId = verifyMfaToken(enrollToken, 'mfa_enroll');
        req.mfaEnrollMode = true;
        next();
        return;
      } catch (verifyErr) {
        next(verifyErr);
        return;
      }
    }
    next(new AppError('Authentication required', 401));
  });
}

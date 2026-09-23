import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { verifyWorkerAccessToken } from '../utils/workerAccessToken';
import { WorkerAuthRepository } from '../../modules/worker-auth/workerAuth.repository';

/**
 * Authentication for the foreign-worker MOBILE principal (SECURITY_PRINCIPLES.md
 * §4). A deliberate PARALLEL of the staff `authenticate`, kept fully separate so
 * the staff path is never touched or weakened:
 *
 *  - Transport is `Authorization: Bearer` (NOT a cookie). The worker app is native
 *    (no browser DOM/localStorage/XSS surface) and stores the token in hardware-
 *    backed secure storage (Keychain/Keystore). A Bearer request carries no ambient
 *    credential, so CSRF is out of scope for the worker portal (documented deviation
 *    from the browser-only "cookies only" rule).
 *  - The token is verified with a DISTINCT audience (`rentplus-worker`), so a staff
 *    token can never authenticate here and a worker token can never authenticate on
 *    the staff `authenticate` (which pins `rentplus-app`).
 *  - Everything authorization cares about — companyId, authEnabled, tokenVersion —
 *    is re-loaded fresh from the Worker row on EVERY request, exactly like staff.
 *    Disabling app access or rotating the QR bumps tokenVersion → revoke-all.
 *
 * On success sets `req.workerPrincipal` (NEVER `req.currentUser`). All failures
 * return the same generic 401 (no disclosure).
 */

/** The trusted, server-side worker context for a request (re-derived from the DB). */
export interface WorkerPrincipal {
  workerId: number;
  companyId: number;
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      workerPrincipal?: WorkerPrincipal;
    }
  }
}

// Repository is the only layer allowed to touch prisma. A single shared instance is
// fine — it is stateless and goes through the `src/lib/prisma` singleton.
const workerAuthRepository = new WorkerAuthRepository();

/** Extract a Bearer token from the Authorization header, or undefined. */
function readBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
  return value.trim() || undefined;
}

export async function authenticateWorker(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearer(req);
  if (!token) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    // Startup config validation guarantees this in real runs; fail closed with a
    // generic 401 rather than leaking a configuration error.
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    // Strict verification (algorithm/issuer/audience pinned) — defends alg-confusion
    // and cross-principal token reuse.
    const payload = verifyWorkerAccessToken(token);

    // The token proves identity (workerId). Company, app-access status, and token
    // version are loaded fresh from the DB so stale claims cannot drive access.
    const worker = await workerAuthRepository.findAuthState(payload.workerId);
    if (!worker) {
      next(new AppError('Authentication required', 401));
      return;
    }

    // App access revoked (manager disabled it) — deny on the next request regardless
    // of an otherwise-valid, unexpired token.
    if (!worker.authEnabled) {
      next(new AppError('Authentication required', 401));
      return;
    }

    // Revoke-all: a token issued before the current security version is rejected
    // (disable / QR rotation / refresh-reuse breach all bump tokenVersion).
    if (payload.tokenVersion !== worker.tokenVersion) {
      next(new AppError('Authentication required', 401));
      return;
    }

    req.workerPrincipal = {
      workerId: worker.id,
      companyId: worker.companyId,
      tokenVersion: worker.tokenVersion,
    };
    next();
  } catch {
    next(new AppError('Authentication required', 401));
  }
}

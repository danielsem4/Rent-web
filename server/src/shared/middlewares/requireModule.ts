import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { isModuleKey, type ModuleKey } from '../modules/registry';

/**
 * Feature-module gate (modular multi-tenancy). Use AFTER `authenticate` — it reads
 * the fresh `enabledModules` list that `authenticate` loaded onto `req.currentUser`
 * (so no extra per-request query), and denies (403) if the caller's company is not
 * entitled to the module.
 *
 *   router.use(authenticate, requireModule(MODULE_KEYS.CORE_RENT))
 *
 * Deny-by-default / fail closed (SECURITY_PRINCIPLES.md §1): a principal with no
 * company (SUPER_ADMIN → empty `enabledModules`) never satisfies the gate. This is
 * server-side enforcement — the real boundary; client nav-hiding is UX only.
 */
export function requireModule(key: ModuleKey) {
  if (!isModuleKey(key)) {
    // Wiring bug (unregistered key), not a runtime authz outcome — fail at load.
    throw new Error(`requireModule: unknown module key "${key}"`);
  }
  return (req: Request, _res: Response, next: NextFunction): void => {
    const current = req.currentUser;
    if (!current) {
      next(new AppError('Authentication required', 401));
      return;
    }
    if (!current.enabledModules.includes(key)) {
      next(new AppError('Forbidden', 403));
      return;
    }
    next();
  };
}

/**
 * Feature-module gate for the foreign-worker MOBILE principal. Parallel of
 * `requireModule` but reads `req.workerPrincipal` (set by `authenticateWorker`).
 * Use on the worker portal so a worker whose company lost the foreign-workers
 * module is denied (the pre-auth worker LOGIN is gated separately, in the
 * repository query, so it stays enumeration-safe).
 */
export function requireWorkerModule(key: ModuleKey) {
  if (!isModuleKey(key)) {
    throw new Error(`requireWorkerModule: unknown module key "${key}"`);
  }
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = req.workerPrincipal;
    if (!principal) {
      next(new AppError('Authentication required', 401));
      return;
    }
    if (!principal.enabledModules.includes(key)) {
      next(new AppError('Forbidden', 403));
      return;
    }
    next();
  };
}

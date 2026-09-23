import { Router } from 'express';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { WorkerRefreshTokenRepository } from '../../worker-auth/workerRefreshToken.repository';
import { AppAccessRepository } from './appAccess.repository';
import { AppAccessService } from './appAccess.service';
import { createAppAccessController } from './appAccess.controller';
import { enableAppAccessSchema } from './appAccess.schema';

export interface AppAccessRouterDeps {
  auditLogger: IAuditLogger;
  /** Base URL for the QR deep link (from config.workerAppLinkBase). */
  appLinkBase: string;
}

/**
 * Manager-only app-access routes, mounted at `/api/workers/:workerId/app-access`
 * (mergeParams so `:workerId` is visible). The parent workers router already applies
 * `authenticate`; every route here additionally requires COMPANY_MANAGER
 * (deny-by-default, §5) and is tenant-scoped via `req.currentUser.companyId`.
 *
 *   GET    /            — current status (enabled / has-QR / phone present)
 *   POST   /enable      — issue QR + enable login (claims the phone)
 *   POST   /rotate-qr   — re-issue the QR (invalidates the old one)
 *   POST   /disable     — revoke access + all sessions (releases the phone)
 *   GET    /qr          — render the current QR as a PNG image
 */
export function createAppAccessRouter(deps: AppAccessRouterDeps): Router {
  const repository = new AppAccessRepository();
  const refreshRepository = new WorkerRefreshTokenRepository();
  const service = new AppAccessService(
    repository,
    refreshRepository,
    deps.auditLogger,
    deps.appLinkBase,
  );
  const controller = createAppAccessController(service);

  const router = Router({ mergeParams: true });
  const canManage = authorize(Role.COMPANY_MANAGER);

  router.get('/', canManage, controller.status);
  router.get('/qr', canManage, controller.qr);
  router.post('/enable', canManage, validateRequest(enableAppAccessSchema), controller.enable);
  router.post('/rotate-qr', canManage, controller.rotateQr);
  router.post('/disable', canManage, controller.disable);

  return router;
}

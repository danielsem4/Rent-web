import { Router } from 'express';
import { authenticateWorker } from '../../shared/middlewares/authenticateWorker';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import type { IFileStorage } from '../../shared/storage/fileStorage';
import { RATE_LIMIT_DEFAULTS } from '../../shared/config/rateLimit';
import { createWorkerRequestRateLimiter } from '../../shared/security/rateLimit';
import { createRequestSchema } from './workerPortal.schema';
import { WorkerPortalRepository } from './workerPortal.repository';
import { WorkerPortalService } from './workerPortal.service';
import { createWorkerPortalController } from './workerPortal.controller';

export interface WorkerPortalRouterDeps {
  auditLogger: IAuditLogger;
  /** Backend for encrypted document storage (shared with the staff workers module). */
  storage: IFileStorage;
}

/**
 * Worker-portal routes, mounted under `/api/worker-portal`. EVERY route is gated by
 * `authenticateWorker` (Bearer, distinct `rentplus-worker` audience) and is strictly
 * self- + tenant-scoped via `req.workerPrincipal` — a worker only ever sees their own
 * data. Staff `authenticate` is never used here, and these routes are never mounted
 * on the staff modules (hard principal separation).
 */
export function createWorkerPortalRouter(deps: WorkerPortalRouterDeps): Router {
  const repo = new WorkerPortalRepository();
  const service = new WorkerPortalService(repo, deps.storage, deps.auditLogger);
  const controller = createWorkerPortalController(service);

  const requestLimiter = createWorkerRequestRateLimiter(RATE_LIMIT_DEFAULTS.workerRequestSubmit);

  const router = Router();

  // Worker principal required for everything below.
  router.use(authenticateWorker);

  router.get('/me', controller.me);
  router.get('/documents', controller.documents);
  router.get('/documents/:id/download', controller.downloadDocument);
  router.get('/housing', controller.housing);
  router.get('/inspection', controller.inspection);
  router.get('/alerts', controller.alerts);
  router.get('/requests', controller.listRequests);
  router.post('/requests', requestLimiter, validateRequest(createRequestSchema), controller.createRequest);

  return router;
}

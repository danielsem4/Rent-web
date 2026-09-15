import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import type { IFileStorage } from '../../shared/storage/fileStorage';
import { PropertiesRepository } from '../properties/properties.repository';
import { createWorkerSchema, updateWorkerSchema } from './workers.schema';
import { WorkersRepository } from './workers.repository';
import { WorkersService } from './workers.service';
import { createWorkersController } from './workers.controller';
import { WorkerDocumentsRepository } from './documents/documents.repository';
import { WorkerDocumentCleanup } from './documents/documents.service';
import { createWorkerDocumentsRouter } from './documents/documents.routes';

export interface WorkersRouterDeps {
  auditLogger: IAuditLogger;
  /** Backend for encrypted document storage (local disk now, S3 later). */
  storage: IFileStorage;
}

/**
 * Workers routes. Multi-tenant CRUD for foreign-worker records, scoped to the
 * caller's company (the `companyId` comes from `req.currentUser`, never the body
 * — enforced in the service/repository). Records carry regulated PII (passport /
 * insurance numbers) which is encrypted at rest and omitted from list responses.
 *
 * Authorization (deny-by-default, §5) is split by verb:
 *   - READ  (GET /, GET /:id): COMPANY_MANAGER + COMPANY_WORKER.
 *   - WRITE (POST/PATCH/DELETE): COMPANY_MANAGER only.
 * SUPER_ADMIN and RENTER are intentionally NOT permitted (they get 403).
 */
export function createWorkersRouter(deps: WorkersRouterDeps): Router {
  // Manual dependency injection: repositories → service → controller. The
  // properties repository is injected as the apartment-assignment lookup (its
  // `findByIdInCompany` already enforces tenant scoping).
  const repository = new WorkersRepository();
  const properties = new PropertiesRepository();
  // On worker delete, the DB document rows cascade but the stored FILES do not —
  // this cleanup removes them (tenant-scoped).
  const documentCleanup = new WorkerDocumentCleanup(new WorkerDocumentsRepository(), deps.storage);
  const service = new WorkersService(repository, properties, documentCleanup, deps.auditLogger);
  const controller = createWorkersController(service);

  const router = Router();

  // Everything requires authentication first.
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createWorkerSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateWorkerSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);

  // Nested identity-document routes: /api/workers/:workerId/documents/*
  router.use(
    '/:workerId/documents',
    createWorkerDocumentsRouter({ auditLogger: deps.auditLogger, storage: deps.storage }),
  );
  return router;
}

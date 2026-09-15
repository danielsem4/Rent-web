import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { createUploadRateLimiter } from '../../../shared/security/rateLimit';
import { RATE_LIMIT_DEFAULTS } from '../../../shared/config/rateLimit';
import type { IFileStorage } from '../../../shared/storage/fileStorage';
import { WorkersRepository } from '../workers.repository';
import { WorkerDocumentsRepository } from './documents.repository';
import { WorkerDocumentsService } from './documents.service';
import { createWorkerDocumentsController } from './documents.controller';
import { uploadDocumentSchema, MAX_FILE_BYTES, ALLOWED_MIME_TYPES } from './documents.schema';

export interface WorkerDocumentsRouterDeps {
  auditLogger: IAuditLogger;
  storage: IFileStorage;
}

/**
 * Worker identity-document routes, mounted at `/api/workers/:workerId/documents`
 * (mergeParams so `:workerId` is visible). Files carry regulated PII — every op is
 * tenant-scoped via `req.currentUser.companyId` and the parent worker is verified
 * to belong to the caller's company in the service.
 *
 * Authorization (deny-by-default, §5), mirroring the workers module:
 *   - READ  (list, download): COMPANY_MANAGER + COMPANY_WORKER.
 *   - WRITE (upload, delete):  COMPANY_MANAGER only.
 */
export function createWorkerDocumentsRouter(deps: WorkerDocumentsRouterDeps): Router {
  const repository = new WorkerDocumentsRepository();
  const workers = new WorkersRepository();
  const service = new WorkerDocumentsService(repository, workers, deps.storage, deps.auditLogger);
  const controller = createWorkerDocumentsController(service);

  // Multipart parsing into memory (the service validates + hands bytes to the
  // storage seam). Hard size cap + single file; a fast MIME pre-filter rejects
  // obvious non-matches early (magic-byte sniff in the service is authoritative).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      cb(null, (ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype));
    },
  });

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);
  const uploadLimiter = createUploadRateLimiter(RATE_LIMIT_DEFAULTS.uploadDocument);

  router.get('/', canRead, controller.list);
  router.get('/:id/download', canRead, controller.download);
  router.post(
    '/',
    canWrite,
    uploadLimiter,
    upload.single('file'),
    validateRequest(uploadDocumentSchema),
    controller.upload,
  );
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

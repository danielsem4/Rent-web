import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { createUploadRateLimiter } from '../../../shared/security/rateLimit';
import { RATE_LIMIT_DEFAULTS } from '../../../shared/config/rateLimit';
import type { IFileStorage } from '../../../shared/storage/fileStorage';
import { PropertiesRepository } from '../properties.repository';
import { PropertyImagesRepository } from './images.repository';
import { PropertyImagesService } from './images.service';
import { createPropertyImagesController } from './images.controller';
import { MAX_FILE_BYTES, ALLOWED_MIME_TYPES } from './images.schema';

export interface PropertyImagesRouterDeps {
  auditLogger: IAuditLogger;
  storage: IFileStorage;
}

/**
 * Property-image (gallery) routes, mounted at `/api/properties/:propertyId/images`
 * (mergeParams so `:propertyId` is visible). Every op is tenant-scoped via
 * `req.currentUser.companyId` and the parent property is verified to belong to the
 * caller's company in the service.
 *
 * Authorization (deny-by-default, §5), mirroring the properties module:
 *   - READ  (list, download): COMPANY_MANAGER + COMPANY_WORKER.
 *   - WRITE (upload, delete):  COMPANY_MANAGER only.
 */
export function createPropertyImagesRouter(deps: PropertyImagesRouterDeps): Router {
  const repository = new PropertyImagesRepository();
  const properties = new PropertiesRepository();
  const service = new PropertyImagesService(repository, properties, deps.storage, deps.auditLogger);
  const controller = createPropertyImagesController(service);

  // Multipart parsing into memory (the service validates + hands bytes to the
  // storage seam). Hard size cap + single file; a fast MIME pre-filter rejects
  // obvious non-images early (magic-byte sniff in the service is authoritative).
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
  router.post('/', canWrite, uploadLimiter, upload.single('file'), controller.upload);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

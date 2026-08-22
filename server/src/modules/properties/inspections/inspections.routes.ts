import { Router } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { PropertiesRepository } from '../properties.repository';
import { InspectionsRepository } from './inspections.repository';
import { InspectionsService } from './inspections.service';
import { createInspectionsController } from './inspections.controller';
import { createInspectionSchema, updateInspectionSchema } from './inspections.schema';

export interface InspectionsRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Periodic-inspection routes, mounted at `/api/properties/:propertyId/inspections`
 * (mergeParams). READ = manager + worker; WRITE = manager only. Parent property
 * ownership + tenant scope enforced in the service.
 */
export function createInspectionsRouter(deps: InspectionsRouterDeps): Router {
  const repository = new InspectionsRepository();
  const properties = new PropertiesRepository();
  const service = new InspectionsService(repository, properties, deps.auditLogger);
  const controller = createInspectionsController(service);

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createInspectionSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateInspectionSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

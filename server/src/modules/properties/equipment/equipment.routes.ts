import { Router } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { PropertiesRepository } from '../properties.repository';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';
import { createEquipmentController } from './equipment.controller';
import { createEquipmentSchema, updateEquipmentSchema } from './equipment.schema';

export interface EquipmentRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Equipment routes, mounted at `/api/properties/:propertyId/equipment`
 * (mergeParams). READ = manager + worker; WRITE = manager only. Parent property
 * ownership + tenant scope enforced in the service.
 */
export function createEquipmentRouter(deps: EquipmentRouterDeps): Router {
  const repository = new EquipmentRepository();
  const properties = new PropertiesRepository();
  const service = new EquipmentService(repository, properties, deps.auditLogger);
  const controller = createEquipmentController(service);

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createEquipmentSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateEquipmentSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

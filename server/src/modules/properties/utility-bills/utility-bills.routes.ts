import { Router } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { PropertiesRepository } from '../properties.repository';
import { UtilityBillsRepository } from './utility-bills.repository';
import { UtilityBillsService } from './utility-bills.service';
import { createUtilityBillsController } from './utility-bills.controller';
import { createUtilityBillSchema, updateUtilityBillSchema } from './utility-bills.schema';

export interface UtilityBillsRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Utility-bill routes, mounted at `/api/properties/:propertyId/utility-bills`
 * (mergeParams so `:propertyId` is visible). Tenant-scoped via
 * `req.currentUser.companyId`; the parent property is verified to belong to the
 * caller's company in the service before any child op.
 *
 * Authorization (deny-by-default, §5), mirroring the properties module:
 *   - READ  (list, get):        COMPANY_MANAGER + COMPANY_WORKER.
 *   - WRITE (create/update/del): COMPANY_MANAGER only.
 * SUPER_ADMIN and RENTER get 403.
 */
export function createUtilityBillsRouter(deps: UtilityBillsRouterDeps): Router {
  const repository = new UtilityBillsRepository();
  const properties = new PropertiesRepository();
  const service = new UtilityBillsService(repository, properties, deps.auditLogger);
  const controller = createUtilityBillsController(service);

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createUtilityBillSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateUtilityBillSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

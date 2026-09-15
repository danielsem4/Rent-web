import { Router } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { PropertiesRepository } from '../properties.repository';
import { GuaranteesRepository } from './guarantees.repository';
import { GuaranteesService } from './guarantees.service';
import { createGuaranteesController } from './guarantees.controller';
import { createGuaranteeSchema, updateGuaranteeSchema } from './guarantees.schema';

export interface GuaranteesRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Guarantee/deposit routes, mounted at `/api/properties/:propertyId/guarantees`
 * (mergeParams). READ = manager + worker; WRITE = manager only. Parent property
 * ownership + tenant scope enforced in the service.
 */
export function createGuaranteesRouter(deps: GuaranteesRouterDeps): Router {
  const repository = new GuaranteesRepository();
  const properties = new PropertiesRepository();
  const service = new GuaranteesService(repository, properties, deps.auditLogger);
  const controller = createGuaranteesController(service);

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createGuaranteeSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateGuaranteeSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

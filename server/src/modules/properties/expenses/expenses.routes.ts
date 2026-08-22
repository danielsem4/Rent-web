import { Router } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { validateRequest } from '../../../shared/middlewares/validateRequest';
import { Role } from '../../../shared/constants/roles';
import type { IAuditLogger } from '../../../shared/audit/auditLogger';
import { PropertiesRepository } from '../properties.repository';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';
import { createExpensesController } from './expenses.controller';
import { createExpenseSchema, updateExpenseSchema } from './expenses.schema';

export interface ExpensesRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Miscellaneous-expense routes, mounted at `/api/properties/:propertyId/expenses`
 * (mergeParams). READ = manager + worker; WRITE = manager only. Parent property
 * ownership + tenant scope enforced in the service.
 */
export function createExpensesRouter(deps: ExpensesRouterDeps): Router {
  const repository = new ExpensesRepository();
  const properties = new PropertiesRepository();
  const service = new ExpensesService(repository, properties, deps.auditLogger);
  const controller = createExpensesController(service);

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createExpenseSchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updateExpenseSchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);
  return router;
}

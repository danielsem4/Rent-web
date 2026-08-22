import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import { createPropertySchema, updatePropertySchema } from './properties.schema';
import { PropertiesRepository } from './properties.repository';
import { PropertiesService } from './properties.service';
import { createPropertiesController } from './properties.controller';
import { createUtilityBillsRouter } from './utility-bills/utility-bills.routes';
import { createEquipmentRouter } from './equipment/equipment.routes';
import { createGuaranteesRouter } from './guarantees/guarantees.routes';
import { createExpensesRouter } from './expenses/expenses.routes';
import { createInspectionsRouter } from './inspections/inspections.routes';
import { createPropertyPaymentsRouter } from './payments/property-payments.routes';

export interface PropertiesRouterDeps {
  auditLogger: IAuditLogger;
}

/**
 * Properties routes. Multi-tenant CRUD scoped to the caller's company (the
 * `companyId` comes from `req.currentUser`, never the body — enforced in the
 * service/repository).
 *
 * Authorization (deny-by-default, SECURITY_PRINCIPLES.md §5) is split by verb:
 *   - READ  (GET /, GET /:id): COMPANY_MANAGER + COMPANY_WORKER.
 *   - WRITE (POST/PATCH/DELETE): COMPANY_MANAGER only.
 * SUPER_ADMIN and RENTER are intentionally NOT permitted here (they get 403).
 * Role authorization is NOT tenant isolation — company scoping is separate and
 * enforced in the repository.
 */
export function createPropertiesRouter(deps: PropertiesRouterDeps): Router {
  // Manual dependency injection: repository → service → controller.
  const repository = new PropertiesRepository();
  const service = new PropertiesService(repository, deps.auditLogger);
  const controller = createPropertiesController(service);

  const router = Router();

  // Everything requires authentication first.
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);
  const canWrite = authorize(Role.COMPANY_MANAGER);

  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canWrite, validateRequest(createPropertySchema), controller.create);
  router.patch('/:id', canWrite, validateRequest(updatePropertySchema), controller.update);
  router.delete('/:id', canWrite, controller.remove);

  // Property-scoped sub-resources (each verifies parent ownership + tenant scope).
  const sub = { auditLogger: deps.auditLogger };
  router.use('/:propertyId/utility-bills', createUtilityBillsRouter(sub));
  router.use('/:propertyId/equipment', createEquipmentRouter(sub));
  router.use('/:propertyId/guarantees', createGuaranteesRouter(sub));
  router.use('/:propertyId/expenses', createExpensesRouter(sub));
  router.use('/:propertyId/inspections', createInspectionsRouter(sub));
  router.use('/:propertyId/payments', createPropertyPaymentsRouter());
  return router;
}

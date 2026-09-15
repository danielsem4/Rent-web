import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import type { IFileStorage } from '../../shared/storage/fileStorage';
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
import { PropertyImagesRepository } from './images/images.repository';
import { PropertyImageCleanup } from './images/images.service';
import { createPropertyImagesRouter } from './images/images.routes';

export interface PropertiesRouterDeps {
  auditLogger: IAuditLogger;
  /** Backend for encrypted image storage (local disk now, S3 later). */
  storage: IFileStorage;
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
  // Manual dependency injection: repository → service → controller. On property
  // delete, the DB image rows cascade but the stored FILES do not — this cleanup
  // removes them (tenant-scoped).
  const repository = new PropertiesRepository();
  const imageCleanup = new PropertyImageCleanup(new PropertyImagesRepository(), deps.storage);
  const service = new PropertiesService(repository, imageCleanup, deps.auditLogger);
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
  router.use(
    '/:propertyId/images',
    createPropertyImagesRouter({ auditLogger: deps.auditLogger, storage: deps.storage }),
  );
  return router;
}

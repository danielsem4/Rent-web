import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/constants/roles';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { createPaymentsController } from './payments.controller';

/**
 * Payments routes. Read-only, multi-tenant list scoped to the caller's company
 * (`companyId` comes from `req.currentUser`, enforced in the repository).
 *
 * Authorization (deny-by-default, SECURITY_PRINCIPLES.md §5) mirrors the
 * properties READ policy: COMPANY_MANAGER + COMPANY_WORKER may read;
 * SUPER_ADMIN and RENTER are intentionally NOT permitted (403). Role
 * authorization is NOT tenant isolation — company scoping is separate and
 * enforced in the repository.
 */
export function createPaymentsRouter(): Router {
  // Manual dependency injection: repository → service → controller.
  const repository = new PaymentsRepository();
  const service = new PaymentsService(repository);
  const controller = createPaymentsController(service);

  const router = Router();

  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);

  router.get('/', canRead, controller.list);
  return router;
}

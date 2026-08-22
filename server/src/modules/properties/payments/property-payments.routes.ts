import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../../shared/middlewares/authenticate';
import { authorize } from '../../../shared/middlewares/authorize';
import { AppError } from '../../../shared/errors/AppError';
import { Role } from '../../../shared/constants/roles';
import { PaymentsRepository } from '../../payments/payments.repository';
import { PaymentsService } from '../../payments/payments.service';
import { PropertiesRepository } from '../properties.repository';
import { assertPropertyInCompany } from '../shared/parentProperty';

function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

/**
 * Read-only rent history for a property: GET /api/properties/:propertyId/payments
 * (mergeParams). Reuses the existing Payment model — no new writable path. The
 * parent property is verified to belong to the caller's company (cross-tenant →
 * 404). READ = COMPANY_MANAGER + COMPANY_WORKER.
 */
export function createPropertyPaymentsRouter(): Router {
  const payments = new PaymentsService(new PaymentsRepository());
  const properties = new PropertiesRepository();

  const router = Router({ mergeParams: true });
  router.use(authenticate);

  const canRead = authorize(Role.COMPANY_MANAGER, Role.COMPANY_WORKER);

  router.get('/', canRead, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const propertyId = parseId(req.params.propertyId, 'Property not found');
      await assertPropertyInCompany(properties, propertyId, req.currentUser!.companyId);
      const list = await payments.listByProperty(propertyId, req.currentUser!);
      res.json({ payments: list });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

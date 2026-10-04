import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import type { AccountMailer } from '../../shared/notifications/mailer';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import { AccountRepository } from '../account/account.repository';
import { AccountService } from '../account/account.service';
import { UsersRepository } from '../users/users.repository';
import {
  createCompanySchema,
  createManagerSchema,
  setModulesSchema,
  updateCompanySchema,
} from './companies.schema';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';
import { createCompaniesController } from './companies.controller';

export interface CompaniesRouterDeps {
  mailer: AccountMailer;
  clientUrl: string;
  auditLogger: IAuditLogger;
}

/**
 * Platform-admin company management (SUPER_ADMIN only). Mounted at
 * /api/admin/companies. Built as a factory because creating a company's first
 * manager issues an invitation (needs the mailer + client URL), reusing the
 * `AccountService` invitation issuer via the narrow `IInvitationIssuer` seam.
 *
 * SECURITY: every route is gated to SUPER_ADMIN. This is the ONLY module whose
 * company scope comes from the path param rather than `req.currentUser.companyId`
 * (the super-admin is cross-tenant and company-less) — the role gate is the
 * boundary. requireModule is intentionally absent (platform admin is not a
 * tenant feature module).
 */
export function createCompaniesRouter(deps: CompaniesRouterDeps): Router {
  const invitationIssuer = new AccountService(
    new AccountRepository(),
    deps.mailer,
    deps.clientUrl,
    deps.auditLogger,
  );
  const repository = new CompaniesRepository();
  const usersRepository = new UsersRepository();
  const service = new CompaniesService(
    repository,
    usersRepository,
    invitationIssuer,
    deps.auditLogger,
  );
  const controller = createCompaniesController(service);

  const router = Router();

  // Authenticate, then gate to SUPER_ADMIN only (deny-by-default). Every other
  // role — including COMPANY_MANAGER — gets 403 here.
  router.use(authenticate, authorize(Role.SUPER_ADMIN));

  router.get('/', controller.list);
  router.post('/', validateRequest(createCompanySchema), controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', validateRequest(updateCompanySchema), controller.update);
  router.put('/:id/modules', validateRequest(setModulesSchema), controller.setModules);
  router.post('/:id/managers', validateRequest(createManagerSchema), controller.createManager);

  return router;
}

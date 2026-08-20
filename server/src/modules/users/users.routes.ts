import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import type { AccountMailer } from '../../shared/notifications/mailer';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import { AccountRepository } from '../account/account.repository';
import { AccountService } from '../account/account.service';
import { createUserSchema, updateUserSchema } from './users.schema';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { createUsersController } from './users.controller';

export interface UsersRouterDeps {
  mailer: AccountMailer;
  clientUrl: string;
  auditLogger: IAuditLogger;
}

/**
 * Users routes. Built as a factory because creating a user now issues an
 * invitation, which needs the mailer + client URL (runtime config from
 * `createApp`). The invitation issuer is the `AccountService` (via the narrow
 * `IInvitationIssuer` seam), keeping token logic in one place.
 */
export function createUsersRouter(deps: UsersRouterDeps): Router {
  // Manual dependency injection: repository → service → controller.
  const invitationIssuer = new AccountService(
    new AccountRepository(),
    deps.mailer,
    deps.clientUrl,
    deps.auditLogger,
  );
  const usersRepository = new UsersRepository();
  const service = new UsersService(usersRepository, invitationIssuer, deps.auditLogger);
  const controller = createUsersController(service);

  const router = Router();

  // Every route in this module: authenticate, then gate to COMPANY_MANAGER only.
  // SUPER_ADMIN is intentionally NOT allowed here — platform administration stays
  // separate (a SUPER_ADMIN hitting these routes gets 403). Role authorization is
  // NOT tenant isolation; company scoping is enforced in the service/repository.
  router.use(authenticate, authorize(Role.COMPANY_MANAGER));

  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', validateRequest(createUserSchema), controller.create);
  router.patch('/:id', validateRequest(updateUserSchema), controller.update);
  return router;
}

import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { Role } from '../../shared/constants/roles';
import { createUserSchema, updateUserSchema } from './users.schema';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { createUsersController } from './users.controller';

// Manual dependency injection: repository → service → controller
const usersRepository = new UsersRepository();
const service = new UsersService(usersRepository);
const controller = createUsersController(service);

export const usersRouter = Router();

// Every route in this module: authenticate, then gate to COMPANY_MANAGER only.
// SUPER_ADMIN is intentionally NOT allowed here — platform administration stays
// separate (a SUPER_ADMIN hitting these routes gets 403). Role authorization is
// NOT tenant isolation; company scoping is enforced in the service/repository.
usersRouter.use(authenticate, authorize(Role.COMPANY_MANAGER));

usersRouter.get('/', controller.list);
usersRouter.get('/:id', controller.get);
usersRouter.post('/', validateRequest(createUserSchema), controller.create);
usersRouter.patch('/:id', validateRequest(updateUserSchema), controller.update);

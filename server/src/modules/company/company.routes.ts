import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { createCompanySchema, updateCompanySchema } from './company.schema';
import { CompanyRepository } from './company.repository';
import { CompanyService } from './company.service';
import { createCompanyController } from './company.controller';

// Manual dependency injection: repository → service → controller
const companyRepository = new CompanyRepository();
const service = new CompanyService(companyRepository);
const controller = createCompanyController(service);

export const companyRouter = Router();

// Managing companies is cross-tenant and platform-level: SUPER_ADMIN only.
companyRouter.use(authenticate);
companyRouter.use(authorize('SUPER_ADMIN'));

companyRouter.get('/', controller.list);
companyRouter.get('/:id', controller.get);
companyRouter.post('/', validateRequest(createCompanySchema), controller.create);
companyRouter.put('/:id', validateRequest(updateCompanySchema), controller.update);
companyRouter.delete('/:id', controller.remove);

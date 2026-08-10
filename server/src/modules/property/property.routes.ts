import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { createPropertySchema, updatePropertySchema } from './property.schema';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';
import { createPropertyController } from './property.controller';

// Manual dependency injection: repository → service → controller
const propertyRepository = new PropertyRepository();
const service = new PropertyService(propertyRepository);
const controller = createPropertyController(service);

export const propertyRouter = Router();

// Every property route requires an authenticated user; companyId comes from the JWT.
propertyRouter.use(authenticate);

// Properties belong to a company; the platform super admin is intentionally excluded.
const propertyRoles = authorize('COMPANY_MANAGER', 'COMPANY_WORKER', 'RENTER');

// NOTE: '/stats' must be declared BEFORE '/:id' or Express 5 matches "stats" as an id.
propertyRouter.get('/stats', propertyRoles, controller.stats);
propertyRouter.get('/', propertyRoles, controller.list);
propertyRouter.get('/:id', propertyRoles, controller.get);

// Mutations are limited to a company's manager.
propertyRouter.post('/', authorize('COMPANY_MANAGER'), validateRequest(createPropertySchema), controller.create);
propertyRouter.put('/:id', authorize('COMPANY_MANAGER'), validateRequest(updatePropertySchema), controller.update);
propertyRouter.delete('/:id', authorize('COMPANY_MANAGER'), controller.remove);

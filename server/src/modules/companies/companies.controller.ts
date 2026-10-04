import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type { CompaniesService } from './companies.service';
import type {
  CreateCompanyDto,
  CreateManagerDto,
  SetModulesDto,
  UpdateCompanyDto,
} from './companies.schema';

/** Parse a `:id` path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Company not found', 404);
  }
  return id;
}

/** The acting super-admin's id, guaranteed present after authenticate+authorize. */
function actorOf(req: Request): { userId: number } {
  return { userId: req.currentUser!.userId };
}

export function createCompaniesController(service: CompaniesService) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const companies = await service.list();
        res.json({ companies });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const company = await service.get(id);
        res.json({ company });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const company = await service.create(
          req.body as CreateCompanyDto,
          actorOf(req),
          buildAuditContext(req),
        );
        res.status(201).json({ company });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const company = await service.update(
          id,
          req.body as UpdateCompanyDto,
          actorOf(req),
          buildAuditContext(req),
        );
        res.json({ company });
      } catch (err) {
        next(err);
      }
    },

    async setModules(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const company = await service.setModules(
          id,
          req.body as SetModulesDto,
          actorOf(req),
          buildAuditContext(req),
        );
        res.json({ company });
      } catch (err) {
        next(err);
      }
    },

    async createManager(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const manager = await service.createManager(
          id,
          req.body as CreateManagerDto,
          actorOf(req),
          buildAuditContext(req),
        );
        res.status(201).json({ manager });
      } catch (err) {
        next(err);
      }
    },
  };
}

import type { Request, Response, NextFunction } from 'express';
import type { CompanyService } from './company.service';
import type { CreateCompanyDto, UpdateCompanyDto } from './company.schema';

export function createCompanyController(service: CompanyService) {
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
        const id = Number(req.params['id']);
        const company = await service.getById(id);
        res.json({ company });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const company = await service.create(req.body as CreateCompanyDto);
        res.status(201).json({ company });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = Number(req.params['id']);
        const company = await service.update(id, req.body as UpdateCompanyDto);
        res.json({ company });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = Number(req.params['id']);
        await service.remove(id, req.currentUser!.companyId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

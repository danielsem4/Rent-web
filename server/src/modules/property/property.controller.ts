import type { Request, Response, NextFunction } from 'express';
import type { PropertyService } from './property.service';
import type { CreatePropertyDto, UpdatePropertyDto } from './property.schema';

export function createPropertyController(service: PropertyService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const properties = await service.list(req.currentUser!.companyId);
        res.json({ properties });
      } catch (err) {
        next(err);
      }
    },

    async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const stats = await service.stats(req.currentUser!.companyId);
        res.json({ stats });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = Number(req.params['id']);
        const property = await service.getById(id, req.currentUser!.companyId);
        res.json({ property });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const property = await service.create(
          req.currentUser!.companyId,
          req.body as CreatePropertyDto,
        );
        res.status(201).json({ property });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = Number(req.params['id']);
        const property = await service.update(
          id,
          req.currentUser!.companyId,
          req.body as UpdatePropertyDto,
        );
        res.json({ property });
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

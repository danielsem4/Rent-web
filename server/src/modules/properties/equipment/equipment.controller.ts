import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { EquipmentService } from './equipment.service';
import type { CreateEquipmentDto, UpdateEquipmentDto } from './equipment.schema';

function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createEquipmentController(service: EquipmentService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const equipment = await service.list(propertyId, req.currentUser!);
        res.json({ equipment });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Equipment not found');
        const item = await service.get(propertyId, id, req.currentUser!);
        res.json({ equipment: item });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const item = await service.create(
          propertyId,
          req.body as CreateEquipmentDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ equipment: item });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Equipment not found');
        const item = await service.update(
          propertyId,
          id,
          req.body as UpdateEquipmentDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ equipment: item });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Equipment not found');
        await service.remove(propertyId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

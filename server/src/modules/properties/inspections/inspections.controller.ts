import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { InspectionsService } from './inspections.service';
import type { CreateInspectionDto, UpdateInspectionDto } from './inspections.schema';

function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createInspectionsController(service: InspectionsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const inspections = await service.list(propertyId, req.currentUser!);
        res.json({ inspections });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Inspection not found');
        const inspection = await service.get(propertyId, id, req.currentUser!);
        res.json({ inspection });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const inspection = await service.create(
          propertyId,
          req.body as CreateInspectionDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ inspection });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Inspection not found');
        const inspection = await service.update(
          propertyId,
          id,
          req.body as UpdateInspectionDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ inspection });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Inspection not found');
        await service.remove(propertyId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { GuaranteesService } from './guarantees.service';
import type { CreateGuaranteeDto, UpdateGuaranteeDto } from './guarantees.schema';

function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createGuaranteesController(service: GuaranteesService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const guarantees = await service.list(propertyId, req.currentUser!);
        res.json({ guarantees });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Guarantee not found');
        const guarantee = await service.get(propertyId, id, req.currentUser!);
        res.json({ guarantee });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const guarantee = await service.create(
          propertyId,
          req.body as CreateGuaranteeDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ guarantee });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Guarantee not found');
        const guarantee = await service.update(
          propertyId,
          id,
          req.body as UpdateGuaranteeDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ guarantee });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Guarantee not found');
        await service.remove(propertyId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

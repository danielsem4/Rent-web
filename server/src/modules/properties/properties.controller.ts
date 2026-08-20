import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type { PropertiesService } from './properties.service';
import type { CreatePropertyDto, UpdatePropertyDto } from './properties.schema';

/** Parse a `:id` path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    // Malformed id can never match a real row — surface the same 404 as a miss.
    throw new AppError('Property not found', 404);
  }
  return id;
}

export function createPropertiesController(service: PropertiesService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const properties = await service.list(req.currentUser!);
        res.json({ properties });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const property = await service.get(id, req.currentUser!);
        res.json({ property });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const property = await service.create(
          req.body as CreatePropertyDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ property });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const property = await service.update(
          id,
          req.body as UpdatePropertyDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ property });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        await service.remove(id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

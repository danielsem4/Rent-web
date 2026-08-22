import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { UtilityBillsService } from './utility-bills.service';
import type { CreateUtilityBillDto, UpdateUtilityBillDto } from './utility-bills.schema';

/** Parse a numeric path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createUtilityBillsController(service: UtilityBillsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const utilityBills = await service.list(propertyId, req.currentUser!);
        res.json({ utilityBills });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Utility bill not found');
        const utilityBill = await service.get(propertyId, id, req.currentUser!);
        res.json({ utilityBill });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const utilityBill = await service.create(
          propertyId,
          req.body as CreateUtilityBillDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ utilityBill });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Utility bill not found');
        const utilityBill = await service.update(
          propertyId,
          id,
          req.body as UpdateUtilityBillDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ utilityBill });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Utility bill not found');
        await service.remove(propertyId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

import type { Request, Response, NextFunction } from 'express';
import type { InspectionsService } from './inspections.service';

export function createInspectionsController(service: InspectionsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const inspections = await service.list(req.currentUser!);
        res.json({ inspections });
      } catch (err) {
        next(err);
      }
    },
  };
}

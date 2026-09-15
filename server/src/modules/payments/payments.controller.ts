import type { Request, Response, NextFunction } from 'express';
import type { PaymentsService } from './payments.service';

export function createPaymentsController(service: PaymentsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const payments = await service.list(req.currentUser!);
        res.json({ payments });
      } catch (err) {
        next(err);
      }
    },
  };
}

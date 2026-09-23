import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { AppAccessService } from './appAccess.service';
import type { EnableAppAccessDto } from './appAccess.schema';

/** Parse the `:workerId` path param, rejecting non-positive integers (→ 404 miss). */
function parseWorkerId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Worker not found', 404);
  }
  return id;
}

export function createAppAccessController(service: AppAccessService) {
  return {
    async status(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseWorkerId(req.params.workerId);
        const appAccess = await service.getStatus(workerId, req.currentUser!);
        res.json({ appAccess });
      } catch (err) {
        next(err);
      }
    },

    async enable(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseWorkerId(req.params.workerId);
        const appAccess = await service.enable(
          workerId,
          req.body as EnableAppAccessDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ appAccess });
      } catch (err) {
        next(err);
      }
    },

    async rotateQr(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseWorkerId(req.params.workerId);
        const appAccess = await service.rotateQr(workerId, req.currentUser!, buildAuditContext(req));
        res.json({ appAccess });
      } catch (err) {
        next(err);
      }
    },

    async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseWorkerId(req.params.workerId);
        const appAccess = await service.disable(workerId, req.currentUser!, buildAuditContext(req));
        res.json({ appAccess });
      } catch (err) {
        next(err);
      }
    },

    async qr(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseWorkerId(req.params.workerId);
        const png = await service.renderQr(workerId, req.currentUser!);
        res.setHeader('Content-Type', 'image/png');
        // The QR encodes a login identifier — never let it be cached by shared proxies.
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(png);
      } catch (err) {
        next(err);
      }
    },
  };
}

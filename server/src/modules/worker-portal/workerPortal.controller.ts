import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type { WorkerPortalService } from './workerPortal.service';
import type { CreateRequestDto } from './workerPortal.schema';

/** Parse a numeric path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createWorkerPortalController(service: WorkerPortalService) {
  return {
    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const profile = await service.getProfile(req.workerPrincipal!);
        res.json({ worker: profile });
      } catch (err) {
        next(err);
      }
    },

    async documents(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const documents = await service.listDocuments(req.workerPrincipal!);
        res.json({ documents });
      } catch (err) {
        next(err);
      }
    },

    async downloadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id, 'Document not found');
        const { buffer, mimeType, originalName } = await service.downloadDocument(
          req.workerPrincipal!,
          id,
          buildAuditContext(req),
        );
        // Always download as an attachment — never render inline (§16).
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
      } catch (err) {
        next(err);
      }
    },

    async housing(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const housing = await service.getHousing(req.workerPrincipal!);
        res.json({ housing });
      } catch (err) {
        next(err);
      }
    },

    async inspection(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const inspection = await service.getInspection(req.workerPrincipal!);
        res.json({ inspection });
      } catch (err) {
        next(err);
      }
    },

    async alerts(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const alerts = await service.getAlerts(req.workerPrincipal!);
        res.json({ alerts });
      } catch (err) {
        next(err);
      }
    },

    async createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const request = await service.createRequest(
          req.workerPrincipal!,
          req.body as CreateRequestDto,
          buildAuditContext(req),
        );
        res.status(201).json({ request });
      } catch (err) {
        next(err);
      }
    },

    async listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const requests = await service.listRequests(req.workerPrincipal!);
        res.json({ requests });
      } catch (err) {
        next(err);
      }
    },
  };
}

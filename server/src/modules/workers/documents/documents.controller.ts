import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { WorkerDocumentsService } from './documents.service';
import type { UploadDocumentDto } from './documents.schema';

/** Parse a numeric path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createWorkerDocumentsController(service: WorkerDocumentsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseId(req.params.workerId, 'Worker not found');
        const documents = await service.list(workerId, req.currentUser!);
        res.json({ documents });
      } catch (err) {
        next(err);
      }
    },

    async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseId(req.params.workerId, 'Worker not found');
        const document = await service.upload(
          workerId,
          req.file, // populated by multer
          req.body as UploadDocumentDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ document });
      } catch (err) {
        next(err);
      }
    },

    async download(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseId(req.params.workerId, 'Worker not found');
        const id = parseId(req.params.id, 'Document not found');
        const { buffer, mimeType, originalName } = await service.download(
          workerId,
          id,
          req.currentUser!,
          buildAuditContext(req),
        );
        // Always download as an attachment — never render inline (§16: never
        // execute/serve uploaded content in a way the browser might interpret).
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const workerId = parseId(req.params.workerId, 'Worker not found');
        const id = parseId(req.params.id, 'Document not found');
        await service.remove(workerId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

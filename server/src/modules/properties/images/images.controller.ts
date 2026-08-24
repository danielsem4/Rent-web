import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { buildAuditContext } from '../../../shared/audit/auditLogger';
import type { PropertyImagesService } from './images.service';

/** Parse a numeric path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown, notFoundMessage: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(notFoundMessage, 404);
  }
  return id;
}

export function createPropertyImagesController(service: PropertyImagesService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const images = await service.list(propertyId, req.currentUser!);
        res.json({ images });
      } catch (err) {
        next(err);
      }
    },

    async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const image = await service.upload(
          propertyId,
          req.file, // populated by multer
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ image });
      } catch (err) {
        next(err);
      }
    },

    async download(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Image not found');
        const { buffer, mimeType, originalName } = await service.download(
          propertyId,
          id,
          req.currentUser!,
          buildAuditContext(req),
        );
        // Always serve as an attachment — never render inline (§16: never
        // execute/serve uploaded content in a way the browser might interpret).
        // The gallery renders images via an authenticated blob fetch + object URL,
        // so this hardening does not need to be relaxed.
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
        const propertyId = parseId(req.params.propertyId, 'Property not found');
        const id = parseId(req.params.id, 'Image not found');
        await service.remove(propertyId, id, req.currentUser!, buildAuditContext(req));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}

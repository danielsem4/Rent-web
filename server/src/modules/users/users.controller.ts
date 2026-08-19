import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type { UsersService } from './users.service';
import type { CreateUserDto, UpdateUserDto } from './users.schema';

/** Parse a `:id` path param, rejecting anything that is not a positive integer. */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    // Malformed id can never match a real row — surface the same 404 as a miss.
    throw new AppError('User not found', 404);
  }
  return id;
}

export function createUsersController(service: UsersService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const users = await service.list(req.currentUser!);
        res.json({ users });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const user = await service.get(id, req.currentUser!);
        res.json({ user });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const user = await service.create(
          req.body as CreateUserDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.status(201).json({ user });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = parseId(req.params.id);
        const user = await service.update(
          id,
          req.body as UpdateUserDto,
          req.currentUser!,
          buildAuditContext(req),
        );
        res.json({ user });
      } catch (err) {
        next(err);
      }
    },
  };
}

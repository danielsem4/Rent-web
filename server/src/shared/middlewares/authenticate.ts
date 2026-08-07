import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { AUTH_COOKIE_NAME } from '../utils/cookie';

export interface JwtPayload {
  userId: number;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;

  if (!token) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    next(new Error('JWT_SECRET is not configured'));
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.currentUser = payload;
    next();
  } catch {
    next(new AppError('Authentication required', 401));
  }
}

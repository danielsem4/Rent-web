import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { AUTH_COOKIE_NAME } from '../utils/cookie';
import { Role } from '../constants/roles';
import { AuthRepository } from '../../modules/auth/auth.repository';

/**
 * Raw JWT payload. `userId` identifies the account; `role`/`companyId` are
 * NON-authoritative snapshot claims captured when the token was issued. They
 * are NOT trusted for authorization — see `CurrentUser` below.
 */
export interface JwtPayload {
  userId: number;
  role: Role;
  companyId: number;
}

/**
 * The trusted, server-side authentication context for a request. `role` and
 * `companyId` are always resolved from the CURRENT database row (by `userId`),
 * never from the token's snapshot claims.
 */
export interface CurrentUser {
  userId: number;
  role: Role;
  companyId: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}

// Repository is the only layer allowed to touch prisma. A single shared instance
// is fine here — it is stateless and goes through the `src/lib/prisma` singleton.
const authRepository = new AuthRepository();

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
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

    // The token proves identity (userId). Everything authorization cares about
    // — role, companyId — is loaded fresh from the DB so stale token claims
    // cannot drive access decisions.
    const user = await authRepository.findById(payload.userId);
    if (!user) {
      // Valid token but the account no longer exists: treat as unauthenticated,
      // with the same generic error (no account-existence disclosure).
      next(new AppError('Authentication required', 401));
      return;
    }

    req.currentUser = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
    };
    next();
  } catch {
    next(new AppError('Authentication required', 401));
  }
}

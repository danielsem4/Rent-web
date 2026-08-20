import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { AUTH_COOKIE_NAME } from '../utils/cookie';
import { Role } from '../constants/roles';
import { JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE } from '../config/jwt';
import { AuthRepository } from '../../modules/auth/auth.repository';

/**
 * Raw JWT payload. `userId` identifies the account; `role`/`companyId` are
 * NON-authoritative snapshot claims captured when the token was issued. They
 * are NOT trusted for authorization — see `CurrentUser` below. `tokenVersion`
 * is the security version the token was issued at; it is compared against the
 * current DB value so a revoke-all (version bump) invalidates old tokens.
 */
export interface JwtPayload {
  userId: number;
  role: Role;
  companyId: number;
  tokenVersion: number;
}

/**
 * The trusted, server-side authentication context for a request. `role`,
 * `companyId`, and `tokenVersion` are always resolved from the CURRENT database
 * row (by `userId`), never from the token's snapshot claims.
 */
export interface CurrentUser {
  userId: number;
  role: Role;
  companyId: number;
  tokenVersion: number;
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
    // Startup config validation (config/env.ts) guarantees this in real runs;
    // fail closed with a generic 401 rather than leaking a configuration error.
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    // Strict verification: only our signing algorithm, issuer, and audience are
    // accepted (defends against alg-confusion and cross-service token reuse).
    const payload = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;

    // The token proves identity (userId). Everything authorization cares about
    // — role, companyId, account status, token version — is loaded fresh from
    // the DB so stale token claims cannot drive access decisions.
    const user = await authRepository.findAuthById(payload.userId);
    if (!user) {
      // Valid token but the account no longer exists: treat as unauthenticated,
      // with the same generic error (no account-existence disclosure).
      next(new AppError('Authentication required', 401));
      return;
    }

    // Disabled accounts are denied on the next protected request, regardless of
    // an otherwise-valid, unexpired token.
    if (!user.isActive) {
      next(new AppError('Authentication required', 401));
      return;
    }

    // Revoke-all: a token issued before the current security version is rejected.
    if (payload.tokenVersion !== user.tokenVersion) {
      next(new AppError('Authentication required', 401));
      return;
    }

    req.currentUser = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch {
    next(new AppError('Authentication required', 401));
  }
}

/**
 * Worker (mobile-app) access-token primitives (SECURITY_PRINCIPLES.md §4). The
 * parallel of the staff access token minted in `AuthService.sign`, but for the
 * foreign-worker principal and under a DISTINCT audience (`JWT_WORKER_AUDIENCE`).
 *
 * `companyId`/`tokenVersion` are snapshot claims: `authenticateWorker` re-derives
 * them from the CURRENT Worker row on every request, so stale claims never drive
 * access. Signing (worker-auth service) and verification (`authenticateWorker`)
 * both read the audience/algorithm/issuer from here so they cannot drift apart.
 */

import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import {
  ACCESS_TOKEN_TTL,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_WORKER_AUDIENCE,
} from '../config/jwt';

/** Raw worker access-token payload. Snapshot claims — re-validated against the DB. */
export interface WorkerJwtPayload {
  workerId: number;
  companyId: number;
  tokenVersion: number;
}

function secret(): string {
  const value = process.env['JWT_SECRET'];
  if (!value) {
    throw new AppError('JWT_SECRET is not configured', 500);
  }
  return value;
}

/** Mint a short-lived worker access token (worker principal, distinct audience). */
export function signWorkerAccessToken(
  workerId: number,
  companyId: number,
  tokenVersion: number,
): string {
  return jwt.sign({ workerId, companyId, tokenVersion }, secret(), {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_WORKER_AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

/**
 * Strictly verify a worker access token (algorithm/issuer/audience pinned) and
 * return its raw payload. Throws 401 on any failure. The caller MUST then re-load
 * the Worker row and re-check `authEnabled` + `tokenVersion` before trusting it.
 */
export function verifyWorkerAccessToken(token: string): WorkerJwtPayload {
  const payload = jwt.verify(token, secret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_WORKER_AUDIENCE,
  }) as Partial<WorkerJwtPayload>;
  if (
    typeof payload.workerId !== 'number' ||
    typeof payload.companyId !== 'number' ||
    typeof payload.tokenVersion !== 'number'
  ) {
    throw new AppError('Authentication required', 401);
  }
  return { workerId: payload.workerId, companyId: payload.companyId, tokenVersion: payload.tokenVersion };
}

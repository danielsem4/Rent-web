import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request correlation id (SECURITY_PRINCIPLES.md §19).
 *
 * Assigns each request a `requestId` that ties together its operational log
 * line, any error log, and (via `buildAuditContext`) its audit records. An
 * inbound `X-Request-Id` is honored ONLY if it is short and matches a safe
 * charset (so a client cannot inject newlines/control chars into log lines —
 * log-forging defense); otherwise a fresh UUID is generated. The chosen id is
 * echoed back in the `X-Request-Id` response header for client-side correlation.
 *
 * Registered FIRST so every downstream log carries the id.
 */

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get('x-request-id');
  const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

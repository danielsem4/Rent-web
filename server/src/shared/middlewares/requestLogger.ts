import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger';

/**
 * HTTP request lifecycle logging (SECURITY_PRINCIPLES.md §19).
 *
 * Emits ONE structured `http_request` line when the response finishes, carrying
 * method, route path (WITHOUT the query string — query params can contain
 * sensitive values, §7), status, latency, the correlation id, and client ip.
 * Never logs request/response bodies or headers. Level scales with status so
 * failures are easy to alert on: 5xx→error, 4xx→warn, else info; `/api/health`
 * is logged at debug to keep health-check noise out of normal output.
 *
 * Registered right after `requestContext` so every line carries `requestId`.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  // Strip any query string — log the path only.
  const path = req.originalUrl.split('?')[0];

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    const context = {
      method: req.method,
      path,
      status: res.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100,
      requestId: req.requestId,
      ip: req.ip,
    };

    if (path === '/api/health') {
      logger.debug('http_request', context);
    } else if (res.statusCode >= 500) {
      logger.error('http_request', context);
    } else if (res.statusCode >= 400) {
      logger.warn('http_request', context);
    } else {
      logger.info('http_request', context);
    }
  });

  next();
}

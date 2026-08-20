import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../utils/cookie';

/**
 * CSRF defense for cookie-based auth (SECURITY_PRINCIPLES.md §13).
 *
 * Auth is a JWT in an HttpOnly cookie the browser attaches automatically, so a
 * forged cross-site request WOULD carry valid credentials — CORS does NOT stop
 * the server from processing it. This middleware adds the required server-side
 * `Origin`/`Referer` check on state-changing requests. It is layered with
 * `SameSite` cookies (defense-in-depth), never a substitute for them.
 *
 * Rules:
 *  - Safe methods (GET/HEAD/OPTIONS) are never blocked — we have no
 *    state-changing GETs (§13).
 *  - The check applies to requests that CARRY THE ACCESS OR THE REFRESH COOKIE,
 *    i.e. authenticated browser requests. The refresh cookie is included because
 *    with short-lived (15m) access tokens the access cookie is usually EXPIRED
 *    (and dropped by the browser) at `/api/auth/refresh` time, so keying only on
 *    the access cookie would leave that state-changing endpoint uncovered.
 *    Unauthenticated calls (e.g. login) and non-browser API clients are not
 *    cookie-CSRF-vulnerable.
 *  - For an authenticated unsafe request, the request origin (from `Origin`, or
 *    parsed from `Referer`) MUST exactly equal the validated allowed origin.
 *    Missing OR mismatched ⇒ 403. We FAIL CLOSED (§1) — no allow-by-default.
 *
 * There is no token/secret here to log.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Extract the origin (scheme://host[:port]) from a Referer URL, or null. */
function originFromReferer(referer: string | undefined): string | null {
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * @param allowedOrigin the single validated allowed origin (e.g. `config.clientUrl`).
 */
export function csrfOriginCheck(allowedOrigin: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    // Only authenticated (cookie-bearing) browser requests are in scope — either
    // the access cookie or the refresh cookie (see the refresh-endpoint note above).
    const hasCredentialCookie =
      Boolean(req.cookies?.[AUTH_COOKIE_NAME]) || Boolean(req.cookies?.[REFRESH_COOKIE_NAME]);
    if (!hasCredentialCookie) {
      next();
      return;
    }

    const requestOrigin = req.get('origin') ?? originFromReferer(req.get('referer'));
    if (!requestOrigin || requestOrigin !== allowedOrigin) {
      // Fail closed: missing or mismatched origin on an authenticated mutation.
      next(new AppError('CSRF validation failed', 403));
      return;
    }

    next();
  };
}

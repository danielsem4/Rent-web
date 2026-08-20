import type { CookieOptions } from 'express';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from '../config/jwt';

export const AUTH_COOKIE_NAME = 'token';
export const REFRESH_COOKIE_NAME = 'refreshToken';

const isProd = process.env['NODE_ENV'] === 'production';

// Reviewed with the Batch-2 CSRF design (SECURITY_PRINCIPLES.md §4/§13): these
// attributes are part of the CSRF defense-in-depth. `sameSite: 'strict'` (prod)
// must NOT be weakened to make requests work — the client is same-origin. No
// `Domain` ⇒ host-only cookie. `secure` is enforced in production.
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  // Cookie lifetime tracks the access-token TTL — single source of truth in config/jwt.
  maxAge: ACCESS_TOKEN_TTL_MS,
  path: '/',
};

const { maxAge: _maxAge, ...clearOptions } = AUTH_COOKIE_OPTIONS;
export const AUTH_COOKIE_CLEAR_OPTIONS: CookieOptions = clearOptions;

// Refresh-token cookie (SECURITY_PRINCIPLES.md §4). Same HttpOnly/Secure/SameSite
// hardening as the access cookie, but SCOPED to `/api/auth` so the browser only
// sends this long-lived credential to `/refresh` and `/logout` — never on ordinary
// `/api/*` calls (least exposure). `maxAge` is the absolute session lifetime.
// `path` MUST match between set and clear or the browser won't clear it.
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: '/api/auth',
};

const { maxAge: _refreshMaxAge, ...refreshClearOptions } = REFRESH_COOKIE_OPTIONS;
export const REFRESH_COOKIE_CLEAR_OPTIONS: CookieOptions = refreshClearOptions;

import type { CookieOptions } from 'express';
import { ACCESS_TOKEN_TTL_MS } from '../config/jwt';

export const AUTH_COOKIE_NAME = 'token';

const isProd = process.env['NODE_ENV'] === 'production';

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

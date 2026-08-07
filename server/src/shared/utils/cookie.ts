import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'token';

const isProd = process.env['NODE_ENV'] === 'production';

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  path: '/',
};

const { maxAge: _maxAge, ...clearOptions } = AUTH_COOKIE_OPTIONS;
export const AUTH_COOKIE_CLEAR_OPTIONS: CookieOptions = clearOptions;

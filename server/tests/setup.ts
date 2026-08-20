import { beforeEach, vi } from 'vitest';

// These must be set BEFORE any app module is imported by a test file:
//  - cookie.ts reads NODE_ENV at import time (drives `secure`/`sameSite`).
//  - AuthService.sign and the `authenticate` middleware read JWT_SECRET at
//    call time; without it both throw.
// setupFiles run before the test files' imports are evaluated, so this is the
// safe place to establish the test environment.
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret';

// Silence structured operational logs in the fast suite (keeps test output clean;
// the logger itself is covered by logger.test.ts with an injected sink).
process.env['LOG_LEVEL'] = 'silent';

// Effectively disable rate limiting for the general fast suite so unrelated
// tests (which log in / refresh many times against one app instance) never trip
// the limiter. The dedicated ratelimit.test.ts builds its OWN app with tiny
// limits via loadConfig(env) to exercise throttling deterministically.
process.env['RATE_LIMIT_LOGIN_IP_MAX'] = '1000000';
process.env['RATE_LIMIT_LOGIN_EMAIL_MAX'] = '1000000';
process.env['RATE_LIMIT_LOGIN_ACCOUNT_MAX'] = '1000000';
process.env['RATE_LIMIT_REFRESH_MAX'] = '1000000';
process.env['RATE_LIMIT_FORGOT_PASSWORD_MAX'] = '1000000';
process.env['RATE_LIMIT_PASSWORD_RESET_MAX'] = '1000000';
process.env['RATE_LIMIT_INVITATION_MAX'] = '1000000';

// Keep each test independent — mock call history is reset between tests.
beforeEach(() => {
  vi.clearAllMocks();
});

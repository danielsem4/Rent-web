import { beforeEach, vi } from 'vitest';

// These must be set BEFORE any app module is imported by a test file:
//  - cookie.ts reads NODE_ENV at import time (drives `secure`/`sameSite`).
//  - AuthService.sign and the `authenticate` middleware read JWT_SECRET at
//    call time; without it both throw.
// setupFiles run before the test files' imports are evaluated, so this is the
// safe place to establish the test environment.
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret';

// Keep each test independent — mock call history is reset between tests.
beforeEach(() => {
  vi.clearAllMocks();
});

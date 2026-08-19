import { defineConfig } from 'vitest/config';

/**
 * Integration config — REAL PostgreSQL + real Prisma. Separate from the fast
 * mocked suite (vitest.config.ts). Run via `npm run test:integration`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/globalSetup.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    // Test files share one database and truncate between tests, so they must not
    // run concurrently against each other.
    fileParallelism: false,
    // Real bcrypt + Postgres round-trips are slower than the mocked suite.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

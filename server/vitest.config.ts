import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests (real PostgreSQL) run via vitest.integration.config.ts,
    // never as part of the fast mocked suite.
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    setupFiles: ['./tests/setup.ts'],
    // No `globals` — tests import { describe, it, expect, vi } explicitly,
    // so tsconfig.json (and the `tsc` build) stay untouched.
  },
});

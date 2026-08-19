// Import FIRST so DATABASE_URL points at the test DB before the Prisma singleton
// (imported on the next line) reads it.
import './testEnv';
import { afterAll } from 'vitest';
import prisma from '../../src/lib/prisma';

// Close the real connection pool once the worker's tests finish.
afterAll(async () => {
  await prisma.$disconnect();
});

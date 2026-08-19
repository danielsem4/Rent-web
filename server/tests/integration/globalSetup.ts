// Import first: guards + points DATABASE_URL at the dedicated test database.
import './testEnv';
import { execFileSync } from 'node:child_process';

/**
 * Runs ONCE before the integration suite. Applies the real repository migration
 * history to the dedicated test database using the normal deploy mechanism. This
 * doubles as the migration-reproducibility check: an empty PostgreSQL database
 * initialized purely from `prisma/migrations` must produce a working schema.
 *
 * The Prisma CLI is a child process that inherits our (already-overridden)
 * DATABASE_URL, so it targets the test DB — never the dev DB.
 */
export default function setup(): void {
  // Static args, no shell — the child inherits our overridden DATABASE_URL.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
}

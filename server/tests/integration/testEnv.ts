/**
 * Integration-test environment bootstrap. This module has SIDE EFFECTS and MUST
 * be imported before anything that transitively imports `src/lib/prisma`, because
 * that singleton reads `process.env.DATABASE_URL` exactly once at import time.
 *
 * ES module imports execute in source order, so any consumer imports this FIRST
 * (`import './testEnv'` as the very first import), guaranteeing the test database
 * URL is in place before the Prisma client is constructed.
 */
import 'dotenv/config';
import { assertTestDatabase } from './helpers/guard';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

// Throws (failing the whole run) unless this is unmistakably a test database.
assertTestDatabase(testDatabaseUrl);

// From here the app's Prisma singleton must see ONLY the test database. This
// override is process-local to the test run and is never written back to .env.
process.env['DATABASE_URL'] = testDatabaseUrl;

// Non-production so the auth cookie is non-secure / sameSite=lax and round-trips
// over Supertest's plain HTTP (see src/shared/utils/cookie.ts). Ensure a secret.
process.env['NODE_ENV'] = 'test';
if (!process.env['JWT_SECRET']) {
  process.env['JWT_SECRET'] = 'integration-test-secret';
}
// Key for encrypting seeded users' TOTP secrets at rest (see helpers/db.ts).
if (!process.env['MFA_ENCRYPTION_KEY']) {
  process.env['MFA_ENCRYPTION_KEY'] = 'integration-test-mfa-encryption-key';
}

// Silence structured operational logs so the suite output stays readable. Audit
// records still go to the real DB (that is what these tests assert on); this only
// suppresses the operational http_request/error lines.
process.env['LOG_LEVEL'] = 'silent';

// Effectively disable rate limiting for the integration suite — it logs in many
// times against one app instance. Throttling behavior is proven in the fast
// suite's dedicated ratelimit.test.ts.
process.env['RATE_LIMIT_LOGIN_IP_MAX'] = '1000000';
process.env['RATE_LIMIT_LOGIN_EMAIL_MAX'] = '1000000';
process.env['RATE_LIMIT_LOGIN_ACCOUNT_MAX'] = '1000000';
process.env['RATE_LIMIT_REFRESH_MAX'] = '1000000';
process.env['RATE_LIMIT_MFA_VERIFY_MAX'] = '1000000';

export const TEST_DATABASE_URL = testDatabaseUrl as string;

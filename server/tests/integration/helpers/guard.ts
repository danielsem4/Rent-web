/**
 * Hard database-safety guard for integration tests.
 *
 * Integration tests run destructive setup/cleanup (migrations, TRUNCATE) against
 * a REAL PostgreSQL database. This guard's whole job is to make it extremely hard
 * for that to ever hit the development or production database: it refuses to
 * proceed unless the configured URL is unmistakably a dedicated *test* database.
 *
 * It deliberately does NOT read a fallback from DATABASE_URL — a missing
 * TEST_DATABASE_URL is a hard error, never a silent fall-through to the dev DB.
 *
 * The primary protection is the database-NAME rule: the name must contain "test".
 * The dev/prod databases (e.g. "rent+") do not, so they can never be targeted —
 * this holds regardless of how vitest propagates process.env across workers.
 *
 * Returns the validated database name on success; throws otherwise.
 */
export function assertTestDatabase(testUrl: string | undefined): string {
  if (!testUrl || testUrl.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests require a dedicated test database ' +
        'and will NOT fall back to DATABASE_URL. Refusing to run.',
    );
  }

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to run integration tests with NODE_ENV=production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(testUrl);
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a valid connection URL: "${testUrl}".`);
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error(`TEST_DATABASE_URL has no database name: "${testUrl}".`);
  }

  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to use database "${dbName}" for integration tests — its name must contain ` +
        '"test" (e.g. rentplus_test). This guards against pointing tests at a dev/prod DB.',
    );
  }

  return dbName;
}

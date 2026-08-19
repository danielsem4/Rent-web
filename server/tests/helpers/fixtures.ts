import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '../../src/shared/constants/roles';

/**
 * A raw `User` DB row as Prisma would return it — deliberately INCLUDES
 * `passwordHash` so tests can prove the auth layer never leaks it.
 */
export interface UserRow {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  companyId: number;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_PASSWORD = 'password123';

/**
 * Builds an isolated, in-memory user row. `passwordHash` is a REAL bcrypt hash
 * (cost 10, matching the login path's `bcrypt.compare`) so valid-login tests
 * exercise the true comparison. Pass `{ password }` to control the plaintext.
 */
export async function makeUserRow(
  opts: Partial<UserRow> & { password?: string } = {},
): Promise<UserRow> {
  const { password = DEFAULT_PASSWORD, ...rest } = opts;
  return {
    id: 1,
    email: 'manager@test.dev',
    name: 'Test Manager',
    role: Role.COMPANY_MANAGER,
    companyId: 1,
    // Fixed timestamps keep rows deterministic (no Date.now in assertions).
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordHash: await bcrypt.hash(password, 10),
    ...rest,
  };
}

export { DEFAULT_PASSWORD };

function secret(): string {
  return process.env['JWT_SECRET'] as string;
}

/**
 * Signs a valid JWT with the same payload shape production uses
 * (`{ userId, role, companyId }`). `role`/`companyId` are snapshot claims — pass
 * deliberately stale values to prove the middleware ignores them in favour of
 * the current DB row.
 */
export function signToken(userId: number, role: Role, companyId = 1): string {
  return jwt.sign({ userId, role, companyId }, secret(), { expiresIn: '8h' });
}

/** Signs a structurally valid but already-expired JWT. */
export function signExpiredToken(userId: number, role: Role, companyId = 1): string {
  return jwt.sign({ userId, role, companyId }, secret(), { expiresIn: -10 });
}

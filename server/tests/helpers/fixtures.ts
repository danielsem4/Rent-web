import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '../../src/shared/constants/roles';
import {
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_TOKEN_TTL,
} from '../../src/shared/config/jwt';

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
  isActive: boolean;
  tokenVersion: number;
  isMfaEnabled: boolean;
  mfaSecret: string | null;
  mfaRecoveryCodes: string[];
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
    isActive: true,
    tokenVersion: 0,
    // MFA off by default; override per test to exercise the two-phase flow.
    isMfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: [],
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
 * (`{ userId, role, companyId, tokenVersion }`) and the same issuer/audience/
 * algorithm, so `authenticate`'s strict verification accepts it. `role`/
 * `companyId` are snapshot claims — pass deliberately stale values to prove the
 * middleware ignores them in favour of the current DB row. Pass `tokenVersion`
 * to simulate a token issued before a revoke-all bump.
 */
export function signToken(userId: number, role: Role, companyId = 1, tokenVersion = 0): string {
  return jwt.sign({ userId, role, companyId, tokenVersion }, secret(), {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

/** Signs a structurally valid but already-expired JWT. */
export function signExpiredToken(userId: number, role: Role, companyId = 1, tokenVersion = 0): string {
  return jwt.sign({ userId, role, companyId, tokenVersion }, secret(), {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: -10,
  });
}

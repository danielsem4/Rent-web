import bcrypt from 'bcrypt';
import request from 'supertest';
import type { Application } from 'express';
import prisma from '../../../src/lib/prisma';
import { Role } from '../../../src/shared/constants/roles';
import type { SafeUser } from '../../../src/modules/auth/auth.repository';
import { assertTestDatabase } from './guard';

export const TEST_PASSWORD = 'password123';

// Every fixture user shares one password; hash it once so we don't pay bcrypt's
// cost per user per test.
let cachedHash: string | null = null;
async function passwordHash(): Promise<string> {
  if (cachedHash === null) {
    cachedHash = await bcrypt.hash(TEST_PASSWORD, 10);
  }
  return cachedHash;
}

/**
 * Wipe all tenant data. Re-asserts the safety guard immediately before the
 * destructive statement — a truncate must NEVER run against a non-test DB, even
 * if some later code path changed DATABASE_URL.
 */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env['DATABASE_URL']);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Company" RESTART IDENTITY CASCADE');
}

export interface SeededUser {
  id: number;
  email: string;
  role: Role;
  companyId: number;
}

export interface SeededTenants {
  companyA: number;
  companyB: number;
  platform: number;
  managerA: SeededUser;
  workerA: SeededUser;
  renterA: SeededUser;
  managerB: SeededUser;
  workerB: SeededUser;
  superAdmin: SeededUser;
}

/**
 * Create deterministic, isolated tenants directly in the test DB and return the
 * REAL generated ids (never assume 1/2/3). Two customer companies plus an
 * internal platform company for the SUPER_ADMIN.
 */
export async function seedTenants(): Promise<SeededTenants> {
  const hash = await passwordHash();

  const companyA = await prisma.company.create({ data: { name: 'Company A (Test)' } });
  const companyB = await prisma.company.create({ data: { name: 'Company B (Test)' } });
  const platform = await prisma.company.create({ data: { name: 'Rent+ Platform (Test)' } });

  const mk = async (
    email: string,
    name: string,
    role: Role,
    companyId: number,
  ): Promise<SeededUser> => {
    const u = await prisma.user.create({
      data: { email, name, role, companyId, passwordHash: hash },
    });
    return { id: u.id, email: u.email, role: u.role, companyId: u.companyId };
  };

  return {
    companyA: companyA.id,
    companyB: companyB.id,
    platform: platform.id,
    managerA: await mk('manager-a@test.local', 'Manager A', Role.COMPANY_MANAGER, companyA.id),
    workerA: await mk('worker-a@test.local', 'Worker A', Role.COMPANY_WORKER, companyA.id),
    renterA: await mk('renter-a@test.local', 'Renter A', Role.RENTER, companyA.id),
    managerB: await mk('manager-b@test.local', 'Manager B', Role.COMPANY_MANAGER, companyB.id),
    workerB: await mk('worker-b@test.local', 'Worker B', Role.COMPANY_WORKER, companyB.id),
    superAdmin: await mk('super@test.local', 'Super Admin', Role.SUPER_ADMIN, platform.id),
  };
}

/**
 * Perform a REAL login through the HTTP stack and return the resulting auth
 * cookie (replay it via `.set('Cookie', cookie)`) plus the safe user payload.
 */
export async function loginAs(
  app: Application,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<{ cookie: string[]; user: SafeUser }> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return { cookie, user: res.body.user as SafeUser };
}

import bcrypt from 'bcrypt';
import request from 'supertest';
import type { Application } from 'express';
import prisma from '../../../src/lib/prisma';
import { createApp, type AppOverrides } from '../../../src/app';
import type { AppConfig } from '../../../src/shared/config/env';
import { Role } from '../../../src/shared/constants/roles';
import { MODULE_KEYS } from '../../../src/shared/modules/registry';
import type { SafeUser } from '../../../src/modules/auth/auth.repository';
import type { AccountMailer } from '../../../src/shared/notifications/mailer';
import { assertTestDatabase } from './guard';

export const TEST_PASSWORD = 'password123';

/**
 * Shared capturing mailer for the integration suite. Secrets (invitation/reset
 * tokens, the email-OTP 2FA code) are delivered ONLY via the mailer — the DB
 * stores just their hash — so tests capture them here to drive flows end-to-end.
 */
export interface DeliveredMail {
  kind: 'invitation' | 'reset' | 'mfa';
  to: string;
  token?: string;
  code?: string;
}

function tokenOf(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

class TestMailer implements AccountMailer {
  readonly delivered: DeliveredMail[] = [];
  async sendInvitation(to: string, link: string): Promise<void> {
    this.delivered.push({ kind: 'invitation', to, token: tokenOf(link) });
  }
  async sendPasswordReset(to: string, link: string): Promise<void> {
    this.delivered.push({ kind: 'reset', to, token: tokenOf(link) });
  }
  async sendMfaCode(to: string, code: string): Promise<void> {
    this.delivered.push({ kind: 'mfa', to, code });
  }
  /** Latest emailed 2FA code for an address (loginAs uses this). */
  lastMfaCode(email: string): string | undefined {
    for (let i = this.delivered.length - 1; i >= 0; i--) {
      const d = this.delivered[i]!;
      if (d.kind === 'mfa' && d.to === email) return d.code;
    }
    return undefined;
  }
  reset(): void {
    this.delivered.length = 0;
  }
}

/** The single mailer every integration app is wired with (see `createTestApp`). */
export const testMailer = new TestMailer();

/**
 * Build an app for integration tests, always wired with the shared capturing
 * `testMailer` so `loginAs` can recover the emailed 2FA code. Extra overrides
 * (e.g. a custom audit logger) still apply; the mailer is fixed.
 */
export function createTestApp(config?: AppConfig, overrides?: Omit<AppOverrides, 'mailer'>): Application {
  return createApp(config, { ...overrides, mailer: testMailer });
}

/** Roles for which 2FA is mandatory (mirrors AuthService.isPrivileged). */
function isPrivileged(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.COMPANY_MANAGER;
}

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
  // AuditLog is listed explicitly: its userId/companyId are LOOSE columns (no FK),
  // so it is NOT reached by the User/Company cascade and must be truncated directly.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "User", "Company" RESTART IDENTITY CASCADE',
  );
  // Clear captured mail so each test starts with an empty delivery log.
  testMailer.reset();
}

export interface SeededUser {
  id: number;
  email: string;
  role: Role;
  // null for the platform-scoped SUPER_ADMIN (belongs to no company).
  companyId: number | null;
}

export interface SeededTenants {
  companyA: number;
  companyB: number;
  managerA: SeededUser;
  workerA: SeededUser;
  renterA: SeededUser;
  managerB: SeededUser;
  workerB: SeededUser;
  superAdmin: SeededUser;
}

/** Hash the shared fixture password and create a user (helper for seeders). */
async function mkUser(
  email: string,
  name: string,
  role: Role,
  companyId: number | null,
): Promise<SeededUser> {
  // Email-OTP 2FA has no enrollment: privileged users simply get an emailed code
  // at login (loginAs completes it via the captured code). Nothing to seed here.
  const hash = await passwordHash();
  const u = await prisma.user.create({
    data: { email, name, role, companyId, passwordHash: hash },
  });
  return { id: u.id, email: u.email, role: u.role, companyId: u.companyId };
}

/** Enable feature modules for a company (modular multi-tenancy entitlements). */
export async function enableModules(companyId: number, moduleKeys: string[]): Promise<void> {
  await prisma.companyModule.createMany({
    data: moduleKeys.map((moduleKey) => ({ companyId, moduleKey, enabled: true })),
    skipDuplicates: true,
  });
}

/**
 * Create a company entitled to exactly `moduleKeys` plus a COMPANY_MANAGER and a
 * COMPANY_WORKER in it. Used by the module-entitlement negative tests to build a
 * tenant that is MISSING a given module. `emailPrefix` keeps fixtures unique.
 */
export async function seedCompanyWithModules(
  name: string,
  moduleKeys: string[],
  emailPrefix: string,
): Promise<{ companyId: number; manager: SeededUser; worker: SeededUser }> {
  const company = await prisma.company.create({ data: { name } });
  await enableModules(company.id, moduleKeys);
  const manager = await mkUser(
    `manager-${emailPrefix}@test.local`,
    `Manager ${emailPrefix}`,
    Role.COMPANY_MANAGER,
    company.id,
  );
  const worker = await mkUser(
    `worker-${emailPrefix}@test.local`,
    `Worker ${emailPrefix}`,
    Role.COMPANY_WORKER,
    company.id,
  );
  return { companyId: company.id, manager, worker };
}

/**
 * Create deterministic, isolated tenants directly in the test DB and return the
 * REAL generated ids (never assume 1/2/3). Two customer companies — BOTH entitled
 * to the shipped feature modules (core-rent + foreign-workers) so the existing
 * feature suites keep passing under the module gates — plus a company-less
 * SUPER_ADMIN (platform-scoped).
 */
export async function seedTenants(): Promise<SeededTenants> {
  const companyA = await prisma.company.create({ data: { name: 'Company A (Test)' } });
  const companyB = await prisma.company.create({ data: { name: 'Company B (Test)' } });
  await enableModules(companyA.id, [MODULE_KEYS.CORE_RENT, MODULE_KEYS.FOREIGN_WORKERS]);
  await enableModules(companyB.id, [MODULE_KEYS.CORE_RENT, MODULE_KEYS.FOREIGN_WORKERS]);

  return {
    companyA: companyA.id,
    companyB: companyB.id,
    managerA: await mkUser('manager-a@test.local', 'Manager A', Role.COMPANY_MANAGER, companyA.id),
    workerA: await mkUser('worker-a@test.local', 'Worker A', Role.COMPANY_WORKER, companyA.id),
    renterA: await mkUser('renter-a@test.local', 'Renter A', Role.RENTER, companyA.id),
    managerB: await mkUser('manager-b@test.local', 'Manager B', Role.COMPANY_MANAGER, companyB.id),
    workerB: await mkUser('worker-b@test.local', 'Worker B', Role.COMPANY_WORKER, companyB.id),
    superAdmin: await mkUser('super@test.local', 'Super Admin', Role.SUPER_ADMIN, null),
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

  // Non-privileged users get a session directly. Privileged users get a challenge
  // token — complete the second factor with the code captured from the mailer.
  if (!res.body.mfaRequired) {
    return { cookie: res.headers['set-cookie'] as unknown as string[], user: res.body.user as SafeUser };
  }

  const code = testMailer.lastMfaCode(email);
  if (!code) {
    throw new Error(`no MFA code was emailed for ${email} (is the app using createTestApp?)`);
  }
  const challenge = await request(app)
    .post('/api/auth/mfa/challenge')
    .send({ mfaToken: res.body.mfaToken, code });
  if (challenge.status !== 200) {
    throw new Error(`MFA challenge failed for ${email}: ${challenge.status} ${JSON.stringify(challenge.body)}`);
  }
  return {
    cookie: challenge.headers['set-cookie'] as unknown as string[],
    user: challenge.body.user as SafeUser,
  };
}

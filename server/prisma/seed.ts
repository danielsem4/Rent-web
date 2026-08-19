import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';

// Keep the seed's own client (not the lib singleton) — this script runs outside
// the app process.
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

// Obvious development-only password. NOT a secret — printed below on purpose so
// developers know how to log into the seeded accounts. Never used in production.
const DEV_PASSWORD = 'password123';

// Clearly-labelled dev data.
const PLATFORM_COMPANY = 'Rent+ Platform (Internal)';
const COMPANY_A = 'Company A (Dev)';
const COMPANY_B = 'Company B (Dev)';

/**
 * Find-or-create a company by name. `Company.name` is NOT unique in the schema,
 * so we can't `upsert`; `findFirst` + `create` keeps the seed idempotent (a
 * re-run reuses the existing company rather than creating a duplicate).
 */
async function ensureCompany(name: string): Promise<{ id: number; reused: boolean }> {
  const existing = await prisma.company.findFirst({ where: { name } });
  if (existing) return { id: existing.id, reused: true };
  const created = await prisma.company.create({ data: { name } });
  return { id: created.id, reused: false };
}

/**
 * Upsert a user by unique email. On re-run we sync name/role/companyId (so drift
 * is corrected) but deliberately DO NOT touch `passwordHash` — re-running the
 * seed must not rehash/rotate an existing account's password.
 */
async function ensureUser(opts: {
  email: string;
  name: string;
  role: Role;
  companyId: number;
}): Promise<{ reused: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email: opts.email } });
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: opts.email },
    update: { name: opts.name, role: opts.role, companyId: opts.companyId },
    create: {
      email: opts.email,
      name: opts.name,
      role: opts.role,
      companyId: opts.companyId,
      passwordHash,
    },
  });
  return { reused: Boolean(existing) };
}

async function main() {
  // ── Rent+ Platform (internal) ─────────────────────────────────────────────
  // NOTE (temporary modeling decision): the schema requires `companyId` on every
  // user (NOT NULL). To satisfy that without touching nullability, SUPER_ADMIN is
  // bound to a clearly-named internal platform company rather than any real
  // customer company. Revisit if/when the platform-vs-customer model changes.
  const platform = await ensureCompany(PLATFORM_COMPANY);
  await ensureUser({
    email: 'super@rentplus.dev',
    name: 'Rent+ Super Admin',
    role: Role.SUPER_ADMIN,
    companyId: platform.id,
  });

  // ── Company A (full role coverage) ────────────────────────────────────────
  const companyA = await ensureCompany(COMPANY_A);
  await ensureUser({
    email: 'manager-a@rentplus.dev',
    name: 'Company A Manager',
    role: Role.COMPANY_MANAGER,
    companyId: companyA.id,
  });
  await ensureUser({
    email: 'worker-a@rentplus.dev',
    name: 'Company A Worker',
    role: Role.COMPANY_WORKER,
    companyId: companyA.id,
  });
  await ensureUser({
    email: 'renter-a@rentplus.dev',
    name: 'Company A Renter',
    role: Role.RENTER,
    companyId: companyA.id,
  });

  // ── Company B (second independent tenant for future multi-tenant tests) ─────
  const companyB = await ensureCompany(COMPANY_B);
  await ensureUser({
    email: 'manager-b@rentplus.dev',
    name: 'Company B Manager',
    role: Role.COMPANY_MANAGER,
    companyId: companyB.id,
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\nSeed complete. Development structure:');
  console.log(`  ${PLATFORM_COMPANY}`);
  console.log('    └── super@rentplus.dev            (SUPER_ADMIN)');
  console.log(`  ${COMPANY_A}`);
  console.log('    ├── manager-a@rentplus.dev        (COMPANY_MANAGER)');
  console.log('    ├── worker-a@rentplus.dev         (COMPANY_WORKER)');
  console.log('    └── renter-a@rentplus.dev         (RENTER)');
  console.log(`  ${COMPANY_B}`);
  console.log('    └── manager-b@rentplus.dev        (COMPANY_MANAGER)');
  console.log(`\n  Dev-only password for all seeded accounts: ${DEV_PASSWORD}`);
  console.log('  (development data only — do not use in production)\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

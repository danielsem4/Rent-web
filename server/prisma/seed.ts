import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, PaymentStatus } from '@prisma/client';

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

/**
 * Find-or-create a property by (companyId, address). `Property` has no unique
 * constraint on those, so we can't `upsert`; `findFirst` + `create` keeps the
 * seed idempotent across re-runs. Returns the property id.
 */
async function ensureProperty(opts: {
  companyId: number;
  city: string;
  address: string;
  monthlyRent: number;
}): Promise<number> {
  const existing = await prisma.property.findFirst({
    where: { companyId: opts.companyId, address: opts.address },
  });
  if (existing) return existing.id;
  const created = await prisma.property.create({
    data: {
      companyId: opts.companyId,
      city: opts.city,
      address: opts.address,
      monthlyRent: opts.monthlyRent,
    },
  });
  return created.id;
}

/**
 * Find-or-create a payment by (companyId, propertyId, dueDate). Keeps the seed
 * idempotent so re-running doesn't pile up duplicate rows.
 */
async function ensurePayment(opts: {
  companyId: number;
  propertyId: number;
  amount: number;
  dueDate: Date;
  status: PaymentStatus;
  paidAt?: Date;
}): Promise<void> {
  const existing = await prisma.payment.findFirst({
    where: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      dueDate: opts.dueDate,
    },
  });
  if (existing) return;
  await prisma.payment.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      amount: opts.amount,
      dueDate: opts.dueDate,
      status: opts.status,
      paidAt: opts.paidAt ?? null,
    },
  });
}

/** A date `days` from today (negative = in the past). */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
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

  // Company A properties + payments — so the dashboard's Apartments count and
  // Outstanding Payments table have real instances to show.
  const aProp1 = await ensureProperty({
    companyId: companyA.id,
    city: 'Tel Aviv',
    address: '12 Rothschild Blvd, Apt 4',
    monthlyRent: 5200,
  });
  const aProp2 = await ensureProperty({
    companyId: companyA.id,
    city: 'Haifa',
    address: '8 HaNassi Ave, Apt 2',
    monthlyRent: 4800,
  });
  const aProp3 = await ensureProperty({
    companyId: companyA.id,
    city: 'Be’er Sheva',
    address: '30 Rager Blvd, Apt 11',
    monthlyRent: 6000,
  });

  // A mix of outstanding (PENDING; some overdue, some upcoming) and settled
  // (PAID) payments — the dashboard table shows only the outstanding ones.
  await ensurePayment({
    companyId: companyA.id,
    propertyId: aProp1,
    amount: 5200,
    dueDate: daysFromNow(-10), // overdue
    status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id,
    propertyId: aProp1,
    amount: 5200,
    dueDate: daysFromNow(-40),
    status: PaymentStatus.PAID,
    paidAt: daysFromNow(-38),
  });
  await ensurePayment({
    companyId: companyA.id,
    propertyId: aProp2,
    amount: 4800,
    dueDate: daysFromNow(5), // upcoming
    status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id,
    propertyId: aProp3,
    amount: 6000,
    dueDate: daysFromNow(-2), // overdue
    status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id,
    propertyId: aProp2,
    amount: 4800,
    dueDate: daysFromNow(-35),
    status: PaymentStatus.PAID,
    paidAt: daysFromNow(-33),
  });

  // ── Company B (second independent tenant for future multi-tenant tests) ─────
  const companyB = await ensureCompany(COMPANY_B);
  await ensureUser({
    email: 'manager-b@rentplus.dev',
    name: 'Company B Manager',
    role: Role.COMPANY_MANAGER,
    companyId: companyB.id,
  });

  // Company B property + payment — belongs to another tenant, so it must NEVER
  // appear in Company A's dashboard (backs the cross-tenant isolation check).
  const bProp1 = await ensureProperty({
    companyId: companyB.id,
    city: 'Jerusalem',
    address: '5 Jaffa St, Apt 7',
    monthlyRent: 5500,
  });
  await ensurePayment({
    companyId: companyB.id,
    propertyId: bProp1,
    amount: 5500,
    dueDate: daysFromNow(-7),
    status: PaymentStatus.PENDING,
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\nSeed complete. Development structure:');
  console.log(`  ${PLATFORM_COMPANY}`);
  console.log('    └── super@rentplus.dev            (SUPER_ADMIN)');
  console.log(`  ${COMPANY_A}`);
  console.log('    ├── manager-a@rentplus.dev        (COMPANY_MANAGER)');
  console.log('    ├── worker-a@rentplus.dev         (COMPANY_WORKER)');
  console.log('    └── renter-a@rentplus.dev         (RENTER)');
  console.log('    + 3 properties, 5 payments (3 outstanding, 2 paid)');
  console.log(`  ${COMPANY_B}`);
  console.log('    └── manager-b@rentplus.dev        (COMPANY_MANAGER)');
  console.log('    + 1 property, 1 outstanding payment');
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

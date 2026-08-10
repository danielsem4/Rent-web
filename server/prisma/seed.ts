import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

/** Company has no natural unique key — find-or-create by name for idempotency. */
async function ensureCompany(name: string) {
  const existing = await prisma.company.findFirst({ where: { name } });
  return existing ?? prisma.company.create({ data: { name } });
}

async function main() {
  // ── Primary demo company + admin user ──────────────────
  const company = await ensureCompany('Rent+ Demo');

  const passwordHash = await bcrypt.hash('password123', 10);

  // One user per role (all password123) so every role is loginable/testable.
  const seedUsers = [
    { email: 'admin@rentplus.dev', name: 'Admin', role: 'SUPER_ADMIN' as const },
    { email: 'manager@rentplus.dev', name: 'Manager User', role: 'COMPANY_MANAGER' as const },
    { email: 'worker@rentplus.dev', name: 'Worker User', role: 'COMPANY_WORKER' as const },
    { email: 'renter@rentplus.dev', name: 'Renter User', role: 'RENTER' as const },
  ];
  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { companyId: company.id, role: u.role },
      create: { email: u.email, passwordHash, name: u.name, role: u.role, companyId: company.id },
    });
  }

  // Sample properties (only when the company has none — keeps seed idempotent).
  const existingCount = await prisma.property.count({ where: { companyId: company.id } });
  if (existingCount === 0) {
    await prisma.property.createMany({
      data: [
        {
          companyId: company.id,
          city: 'Tel Aviv',
          address: 'Rothschild Blvd 12, Apt 4',
          entryCode: '4821',
          electricMeter: 'EL-99231',
          waterMeter: 'WM-55012',
          ownerName: 'Dana Cohen',
          ownerPhone: '+972-52-1112233',
          contractStart: new Date('2025-09-01'),
          contractEnd: new Date('2026-08-31'),
          monthlyRent: 6800,
          capacity: 4,
          notes: 'Ground floor, near light rail.',
        },
        {
          companyId: company.id,
          city: 'Haifa',
          address: 'Herzl St 45',
          entryCode: '1090',
          ownerName: 'Yossi Levi',
          ownerPhone: '+972-54-9988776',
          contractStart: new Date('2025-06-15'),
          contractEnd: new Date('2026-09-05'),
          monthlyRent: 4200,
          capacity: 3,
        },
        {
          companyId: company.id,
          city: 'Jerusalem',
          address: 'Jaffa Rd 88, Apt 7',
          entryCode: '7345',
          ownerName: 'Rivka Mizrahi',
          ownerPhone: '+972-58-4433221',
          contractStart: new Date('2025-01-01'),
          contractEnd: new Date('2026-12-31'),
          monthlyRent: 5100,
          capacity: 2,
        },
        {
          companyId: company.id,
          city: "Be'er Sheva",
          address: 'Ringelblum 7',
          ownerName: 'Amir Shapira',
          ownerPhone: '+972-50-1234567',
          monthlyRent: 3900,
          capacity: 5,
          notes: 'Student housing.',
        },
      ],
    });
  }

  // ── Second company (isolation check) ───────────────────
  // Its property must NEVER appear when querying as the Rent+ Demo admin.
  const other = await ensureCompany('Other Co');
  const otherCount = await prisma.property.count({ where: { companyId: other.id } });
  if (otherCount === 0) {
    await prisma.property.create({
      data: {
        companyId: other.id,
        city: 'Eilat',
        address: 'Do-not-leak St 1',
        monthlyRent: 9999,
        capacity: 1,
      },
    });
  }

  console.log(
    `Seeded company "${company.id}" with ${seedUsers.length} users (one per role, all password123) and sample properties.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

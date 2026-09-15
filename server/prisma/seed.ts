import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Role,
  PaymentStatus,
  UtilityType,
  UtilityBillStatus,
  EquipmentCondition,
  GuaranteeType,
  GuaranteeStatus,
  ExpenseCategory,
} from '@prisma/client';
import { encryptField } from '../src/shared/utils/fieldEncryption';

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

// Addresses of the legacy minimal Company-A properties that the richer seed
// replaces. On a non-reset DB we remove these (and their cascade children) so a
// re-run lands on the new 4-property dataset instead of piling up alongside it.
const LEGACY_A_ADDRESSES = [
  '12 Rothschild Blvd, Apt 4',
  '8 HaNassi Ave, Apt 2',
  '30 Rager Blvd, Apt 11',
];

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
 * Find-or-create a fully-detailed property by (companyId, address). `Property`
 * has no unique constraint on those, so we can't `upsert`; `findFirst` + `create`
 * keeps the seed idempotent across re-runs. Returns the property id.
 *
 * NOTE: `total` (current occupant count) is a manually-stored Int — the app does
 * NOT derive it from the number of assigned workers. So for a property to render
 * "full", pass `total === maxCapacity` and assign exactly that many workers.
 */
async function ensureFullProperty(opts: {
  companyId: number;
  city: string;
  address: string;
  entryCode: string;
  electricMeter: string;
  waterMeter: string;
  ownerName: string;
  ownerPhone: string;
  contractStart: Date;
  contractEnd: Date;
  monthlyRent: number;
  rooms: number;
  maxCapacity: number;
  total: number;
  notes: string;
}): Promise<number> {
  const existing = await prisma.property.findFirst({
    where: { companyId: opts.companyId, address: opts.address },
  });
  if (existing) return existing.id;
  const created = await prisma.property.create({ data: { ...opts } });
  return created.id;
}

/**
 * Find-or-create a worker by (companyId, nameEn). The sensitive identifier
 * columns are encrypted (non-searchable), so we dedupe on the English name.
 * Mirrors `workers.repository.ts::toColumns`: a truthy passport / policy number
 * is stored via `encryptField(...)`, an empty value is stored as `null`.
 */
async function ensureWorker(opts: {
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate: Date;
  preferredLanguage: 'th' | 'hi' | 'si' | 'he';
  passportNumber: string;
  passportExpiry: Date;
  visaType: string;
  visaExpiry: Date;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceCoverageType: string;
  insuranceExpiry: Date;
  phone: string;
  employer: string;
  propertyId: number | null;
  notes: string;
}): Promise<number> {
  const existing = await prisma.worker.findFirst({
    where: { companyId: opts.companyId, nameEn: opts.nameEn },
  });
  if (existing) return existing.id;
  const created = await prisma.worker.create({
    data: {
      companyId: opts.companyId,
      nameHe: opts.nameHe,
      nameEn: opts.nameEn,
      nationality: opts.nationality,
      entryDate: opts.entryDate,
      preferredLanguage: opts.preferredLanguage,
      passportNumberEnc: opts.passportNumber ? encryptField(opts.passportNumber) : null,
      passportExpiry: opts.passportExpiry,
      visaType: opts.visaType,
      visaExpiry: opts.visaExpiry,
      insuranceProvider: opts.insuranceProvider,
      insurancePolicyNumEnc: opts.insurancePolicyNumber
        ? encryptField(opts.insurancePolicyNumber)
        : null,
      insuranceCoverageType: opts.insuranceCoverageType,
      insuranceExpiry: opts.insuranceExpiry,
      phone: opts.phone,
      employer: opts.employer,
      propertyId: opts.propertyId,
      notes: opts.notes,
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

/** Find-or-create a utility bill by (companyId, propertyId, type, dueDate). */
async function ensureUtilityBill(opts: {
  companyId: number;
  propertyId: number;
  type: UtilityType;
  amount: number;
  dueDate: Date;
  status: UtilityBillStatus;
  paidAt?: Date;
  notes?: string;
}): Promise<void> {
  const existing = await prisma.utilityBill.findFirst({
    where: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      type: opts.type,
      dueDate: opts.dueDate,
    },
  });
  if (existing) return;
  await prisma.utilityBill.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      type: opts.type,
      amount: opts.amount,
      dueDate: opts.dueDate,
      status: opts.status,
      paidAt: opts.paidAt ?? null,
      notes: opts.notes ?? null,
    },
  });
}

/** Find-or-create equipment by (companyId, propertyId, name). */
async function ensureEquipment(opts: {
  companyId: number;
  propertyId: number;
  name: string;
  quantity: number;
  condition: EquipmentCondition;
  serialNumber?: string;
  notes?: string;
}): Promise<void> {
  const existing = await prisma.equipment.findFirst({
    where: { companyId: opts.companyId, propertyId: opts.propertyId, name: opts.name },
  });
  if (existing) return;
  await prisma.equipment.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      name: opts.name,
      quantity: opts.quantity,
      condition: opts.condition,
      serialNumber: opts.serialNumber ?? null,
      notes: opts.notes ?? null,
    },
  });
}

/** Find-or-create a guarantee by (companyId, propertyId, type). */
async function ensureGuarantee(opts: {
  companyId: number;
  propertyId: number;
  type: GuaranteeType;
  amount: number;
  bank?: string;
  expiryDate?: Date;
  status: GuaranteeStatus;
  notes?: string;
}): Promise<void> {
  const existing = await prisma.guarantee.findFirst({
    where: { companyId: opts.companyId, propertyId: opts.propertyId, type: opts.type },
  });
  if (existing) return;
  await prisma.guarantee.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      type: opts.type,
      amount: opts.amount,
      bank: opts.bank ?? null,
      expiryDate: opts.expiryDate ?? null,
      status: opts.status,
      notes: opts.notes ?? null,
    },
  });
}

/** Find-or-create an expense by (companyId, propertyId, category, date). */
async function ensureExpense(opts: {
  companyId: number;
  propertyId: number;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  notes?: string;
}): Promise<void> {
  const existing = await prisma.expense.findFirst({
    where: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      category: opts.category,
      date: opts.date,
    },
  });
  if (existing) return;
  await prisma.expense.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      category: opts.category,
      amount: opts.amount,
      date: opts.date,
      notes: opts.notes ?? null,
    },
  });
}

/** Find-or-create an inspection by (companyId, propertyId, nextInspectionDate). */
async function ensureInspection(opts: {
  companyId: number;
  propertyId: number;
  lastInspectionDate: Date;
  nextInspectionDate: Date;
  notes?: string;
}): Promise<void> {
  const existing = await prisma.inspection.findFirst({
    where: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      nextInspectionDate: opts.nextInspectionDate,
    },
  });
  if (existing) return;
  await prisma.inspection.create({
    data: {
      companyId: opts.companyId,
      propertyId: opts.propertyId,
      lastInspectionDate: opts.lastInspectionDate,
      nextInspectionDate: opts.nextInspectionDate,
      notes: opts.notes ?? null,
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

  // Replace the legacy minimal properties: delete them (payments cascade, and any
  // assigned workers are set-null) so a re-run converges on the 4-property dataset
  // below rather than keeping the old bare rows around.
  await prisma.property.deleteMany({
    where: { companyId: companyA.id, address: { in: LEGACY_A_ADDRESSES } },
  });

  // ── Company A: 4 fully-detailed properties ────────────────────────────────
  // P1 & P2 are FULL (total === maxCapacity, occupied by assigned workers) and
  // carry the complete sub-resource set (bills / equipment / guarantees /
  // expenses / inspections / rent payments). P3 is partially occupied, P4 vacant.
  const p1 = await ensureFullProperty({
    companyId: companyA.id,
    city: 'Tel Aviv',
    address: '12 Rothschild Blvd, Apt 4',
    entryCode: '4821#',
    electricMeter: 'EM-TA-559023',
    waterMeter: 'WM-TA-118845',
    ownerName: 'Yael Rosenberg',
    ownerPhone: '050-441-2290',
    contractStart: daysFromNow(-300),
    contractEnd: daysFromNow(65),
    monthlyRent: 5200,
    rooms: 4,
    maxCapacity: 6,
    total: 6,
    notes: 'Ground-floor unit with shared yard. Full — 6 workers housed.',
  });
  const p2 = await ensureFullProperty({
    companyId: companyA.id,
    city: 'Bat Yam',
    address: '27 Ben Gurion Ave, Apt 9',
    entryCode: '9034#',
    electricMeter: 'EM-BY-770114',
    waterMeter: 'WM-BY-330298',
    ownerName: 'Moshe Azoulay',
    ownerPhone: '052-778-6613',
    contractStart: daysFromNow(-220),
    contractEnd: daysFromNow(145),
    monthlyRent: 4800,
    rooms: 3,
    maxCapacity: 5,
    total: 5,
    notes: 'Near the beach. Full — 5 workers housed.',
  });
  const p3 = await ensureFullProperty({
    companyId: companyA.id,
    city: 'Netanya',
    address: '3 HaAtzmaut Sq, Apt 12',
    entryCode: '1207#',
    electricMeter: 'EM-NT-604471',
    waterMeter: 'WM-NT-220955',
    ownerName: 'Dana Shapira',
    ownerPhone: '054-902-3348',
    contractStart: daysFromNow(-120),
    contractEnd: daysFromNow(245),
    monthlyRent: 5600,
    rooms: 4,
    maxCapacity: 4,
    total: 2,
    notes: 'Partially occupied — 2 of 4 beds in use.',
  });
  const p4 = await ensureFullProperty({
    companyId: companyA.id,
    city: 'Ashdod',
    address: '18 Rogozin St, Apt 5',
    entryCode: '5566#',
    electricMeter: 'EM-AS-889200',
    waterMeter: 'WM-AS-447716',
    ownerName: 'Eitan Levi',
    ownerPhone: '053-610-7742',
    contractStart: daysFromNow(-30),
    contractEnd: daysFromNow(335),
    monthlyRent: 5000,
    rooms: 3,
    maxCapacity: 3,
    total: 0,
    notes: 'Newly onboarded, currently vacant and ready for occupancy.',
  });

  // ── Company A: 15 foreign workers ─────────────────────────────────────────
  // Realistic Israeli foreign-worker housing mix (Thai / Indian / Sri Lankan
  // agriculture & construction). Assignment: 6→P1, 5→P2, 2→P3, 2 unassigned.
  // A few expiries are set within 30/60/90 days so the Workers screen's
  // expiry-alert badges light up.
  const workers: Array<Parameters<typeof ensureWorker>[0]> = [
    // P1 — Tel Aviv (6)
    {
      companyId: companyA.id, nameHe: 'סומצ׳אי פראסרט', nameEn: 'Somchai Prasert',
      nationality: 'Thailand', entryDate: daysFromNow(-640), preferredLanguage: 'th',
      passportNumber: 'AA5582013', passportExpiry: daysFromNow(720), visaType: 'B-1',
      visaExpiry: daysFromNow(210), insuranceProvider: 'Harel',
      insurancePolicyNumber: 'HR-2290145', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(180), phone: '055-201-4471', employer: 'Galil Agriculture Ltd',
      propertyId: p1, notes: 'Team lead for the northern greenhouse crew.',
    },
    {
      companyId: companyA.id, nameHe: 'אנן צ׳איפורן', nameEn: 'Anan Chaiyaporn',
      nationality: 'Thailand', entryDate: daysFromNow(-410), preferredLanguage: 'th',
      passportNumber: 'AB7741220', passportExpiry: daysFromNow(85), visaType: 'B-1',
      visaExpiry: daysFromNow(85), insuranceProvider: 'Clal',
      insurancePolicyNumber: 'CL-8830271', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(120), phone: '055-330-9982', employer: 'Galil Agriculture Ltd',
      propertyId: p1, notes: 'Passport up for renewal soon.',
    },
    {
      companyId: companyA.id, nameHe: 'ראג׳ש קומאר', nameEn: 'Rajesh Kumar',
      nationality: 'India', entryDate: daysFromNow(-520), preferredLanguage: 'hi',
      passportNumber: 'M4471928', passportExpiry: daysFromNow(940), visaType: 'B-1',
      visaExpiry: daysFromNow(300), insuranceProvider: 'Phoenix',
      insurancePolicyNumber: 'PH-5561203', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(260), phone: '055-118-2093', employer: 'Ashtrom Construction',
      propertyId: p1, notes: 'Certified scaffolding installer.',
    },
    {
      companyId: companyA.id, nameHe: 'אמריט סינג', nameEn: 'Amrit Singh',
      nationality: 'India', entryDate: daysFromNow(-275), preferredLanguage: 'hi',
      passportNumber: 'N9920481', passportExpiry: daysFromNow(560), visaType: 'B-1',
      visaExpiry: daysFromNow(55), insuranceProvider: 'Menora Mivtachim',
      insurancePolicyNumber: 'MN-7712045', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(28), phone: '055-664-1120', employer: 'Ashtrom Construction',
      propertyId: p1, notes: 'Insurance renewal due within the month.',
    },
    {
      companyId: companyA.id, nameHe: 'נובאן פררה', nameEn: 'Nuwan Perera',
      nationality: 'Sri Lanka', entryDate: daysFromNow(-720), preferredLanguage: 'si',
      passportNumber: 'N6640913', passportExpiry: daysFromNow(410), visaType: 'B-1',
      visaExpiry: daysFromNow(160), insuranceProvider: 'Harel',
      insurancePolicyNumber: 'HR-3341902', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(340), phone: '055-772-3301', employer: 'Galil Agriculture Ltd',
      propertyId: p1, notes: 'Speaks basic Hebrew, helps translate for the crew.',
    },
    {
      companyId: companyA.id, nameHe: 'וויצ׳אי בונמי', nameEn: 'Wichai Boonmee',
      nationality: 'Thailand', entryDate: daysFromNow(-190), preferredLanguage: 'th',
      passportNumber: 'AC1129837', passportExpiry: daysFromNow(1020), visaType: 'B-1',
      visaExpiry: daysFromNow(400), insuranceProvider: 'Clal',
      insurancePolicyNumber: 'CL-9902314', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(365), phone: '055-901-5567', employer: 'Galil Agriculture Ltd',
      propertyId: p1, notes: 'Recently arrived, all documents current.',
    },
    // P2 — Bat Yam (5)
    {
      companyId: companyA.id, nameHe: 'ניראן סוקסאוואט', nameEn: 'Niran Suksawat',
      nationality: 'Thailand', entryDate: daysFromNow(-330), preferredLanguage: 'th',
      passportNumber: 'AD4408122', passportExpiry: daysFromNow(58), visaType: 'B-1',
      visaExpiry: daysFromNow(150), insuranceProvider: 'Phoenix',
      insurancePolicyNumber: 'PH-2214098', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(210), phone: '055-440-1198', employer: 'Coastal Farms',
      propertyId: p2, notes: 'Passport within 60-day expiry window.',
    },
    {
      companyId: companyA.id, nameHe: 'ויג׳אי שארמה', nameEn: 'Vijay Sharma',
      nationality: 'India', entryDate: daysFromNow(-455), preferredLanguage: 'hi',
      passportNumber: 'M7781230', passportExpiry: daysFromNow(680), visaType: 'B-1',
      visaExpiry: daysFromNow(240), insuranceProvider: 'Harel',
      insurancePolicyNumber: 'HR-5590213', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(190), phone: '055-889-4412', employer: 'Danya Cebus',
      propertyId: p2, notes: 'Electrician, holds an Israeli safety certificate.',
    },
    {
      companyId: companyA.id, nameHe: 'קאסון פרננדו', nameEn: 'Kasun Fernando',
      nationality: 'Sri Lanka', entryDate: daysFromNow(-610), preferredLanguage: 'si',
      passportNumber: 'N3320917', passportExpiry: daysFromNow(300), visaType: 'B-1',
      visaExpiry: daysFromNow(25), insuranceProvider: 'Menora Mivtachim',
      insurancePolicyNumber: 'MN-4419083', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(95), phone: '055-201-7734', employer: 'Coastal Farms',
      propertyId: p2, notes: 'Visa renewal urgent — under 30 days.',
    },
    {
      companyId: companyA.id, nameHe: 'סורש פאטל', nameEn: 'Suresh Patel',
      nationality: 'India', entryDate: daysFromNow(-240), preferredLanguage: 'hi',
      passportNumber: 'N5541209', passportExpiry: daysFromNow(880), visaType: 'B-1',
      visaExpiry: daysFromNow(330), insuranceProvider: 'Clal',
      insurancePolicyNumber: 'CL-6612340', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(300), phone: '055-330-2201', employer: 'Danya Cebus',
      propertyId: p2, notes: 'All documents current.',
    },
    {
      companyId: companyA.id, nameHe: 'קיטיסאק וונג', nameEn: 'Kittisak Wong',
      nationality: 'Thailand', entryDate: daysFromNow(-500), preferredLanguage: 'th',
      passportNumber: 'AE9903471', passportExpiry: daysFromNow(150), visaType: 'B-1',
      visaExpiry: daysFromNow(88), insuranceProvider: 'Phoenix',
      insurancePolicyNumber: 'PH-8830142', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(140), phone: '055-664-9987', employer: 'Coastal Farms',
      propertyId: p2, notes: 'Visa within 90-day window.',
    },
    // P3 — Netanya (2)
    {
      companyId: companyA.id, nameHe: 'סוניל בנדרה', nameEn: 'Sunil Bandara',
      nationality: 'Sri Lanka', entryDate: daysFromNow(-160), preferredLanguage: 'si',
      passportNumber: 'N7712048', passportExpiry: daysFromNow(760), visaType: 'B-1',
      visaExpiry: daysFromNow(280), insuranceProvider: 'Harel',
      insurancePolicyNumber: 'HR-1120934', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(250), phone: '055-118-6640', employer: 'Sharon Landscaping',
      propertyId: p3, notes: 'Gardening and landscaping crew.',
    },
    {
      companyId: companyA.id, nameHe: 'צ׳מינדה סילבה', nameEn: 'Chaminda Silva',
      nationality: 'Sri Lanka', entryDate: daysFromNow(-95), preferredLanguage: 'si',
      passportNumber: 'N8840217', passportExpiry: daysFromNow(600), visaType: 'B-1',
      visaExpiry: daysFromNow(200), insuranceProvider: 'Menora Mivtachim',
      insurancePolicyNumber: 'MN-2201948', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(170), phone: '055-772-1109', employer: 'Sharon Landscaping',
      propertyId: p3, notes: 'Recently assigned to the Netanya unit.',
    },
    // Unassigned (2) — housed pending property assignment
    {
      companyId: companyA.id, nameHe: 'פראסיט תונגצ׳אי', nameEn: 'Prasit Thongchai',
      nationality: 'Thailand', entryDate: daysFromNow(-45), preferredLanguage: 'th',
      passportNumber: 'AF2213097', passportExpiry: daysFromNow(1080), visaType: 'B-1',
      visaExpiry: daysFromNow(420), insuranceProvider: 'Clal',
      insurancePolicyNumber: 'CL-3312094', insuranceCoverageType: 'Comprehensive',
      insuranceExpiry: daysFromNow(400), phone: '055-901-3320', employer: 'Galil Agriculture Ltd',
      propertyId: null, notes: 'Newly arrived — awaiting housing assignment.',
    },
    {
      companyId: companyA.id, nameHe: 'מאנוג׳ ורמה', nameEn: 'Manoj Verma',
      nationality: 'India', entryDate: daysFromNow(-20), preferredLanguage: 'hi',
      passportNumber: 'N9930148', passportExpiry: daysFromNow(990), visaType: 'B-1',
      visaExpiry: daysFromNow(390), insuranceProvider: 'Phoenix',
      insurancePolicyNumber: 'PH-4419023', insuranceCoverageType: 'Foreign Worker Medical',
      insuranceExpiry: daysFromNow(360), phone: '055-440-8871', employer: 'Ashtrom Construction',
      propertyId: null, notes: 'Awaiting bed allocation in Ashdod.',
    },
  ];
  for (const w of workers) {
    await ensureWorker(w);
  }

  // ── Company A: full sub-resources for the two FULL properties (P1, P2) ──────
  // Rent payments (mix of outstanding + settled)
  await ensurePayment({
    companyId: companyA.id, propertyId: p1, amount: 5200,
    dueDate: daysFromNow(-8), status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id, propertyId: p1, amount: 5200,
    dueDate: daysFromNow(-38), status: PaymentStatus.PAID, paidAt: daysFromNow(-36),
  });
  await ensurePayment({
    companyId: companyA.id, propertyId: p2, amount: 4800,
    dueDate: daysFromNow(6), status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id, propertyId: p2, amount: 4800,
    dueDate: daysFromNow(-34), status: PaymentStatus.PAID, paidAt: daysFromNow(-32),
  });
  // A single rent payment each for P3 / P4 so their finances tab isn't empty.
  await ensurePayment({
    companyId: companyA.id, propertyId: p3, amount: 5600,
    dueDate: daysFromNow(-3), status: PaymentStatus.PENDING,
  });
  await ensurePayment({
    companyId: companyA.id, propertyId: p4, amount: 5000,
    dueDate: daysFromNow(12), status: PaymentStatus.PENDING,
  });

  // Utility bills
  await ensureUtilityBill({
    companyId: companyA.id, propertyId: p1, type: UtilityType.ELECTRICITY,
    amount: 640, dueDate: daysFromNow(-5), status: UtilityBillStatus.PENDING,
    notes: 'Two-month IEC billing cycle.',
  });
  await ensureUtilityBill({
    companyId: companyA.id, propertyId: p1, type: UtilityType.WATER,
    amount: 310, dueDate: daysFromNow(-40), status: UtilityBillStatus.PAID,
    paidAt: daysFromNow(-37),
  });
  await ensureUtilityBill({
    companyId: companyA.id, propertyId: p1, type: UtilityType.PROPERTY_TAX,
    amount: 1180, dueDate: daysFromNow(20), status: UtilityBillStatus.PENDING,
    notes: 'Arnona, bi-monthly.',
  });
  await ensureUtilityBill({
    companyId: companyA.id, propertyId: p2, type: UtilityType.ELECTRICITY,
    amount: 520, dueDate: daysFromNow(-2), status: UtilityBillStatus.PENDING,
  });
  await ensureUtilityBill({
    companyId: companyA.id, propertyId: p2, type: UtilityType.GAS,
    amount: 145, dueDate: daysFromNow(-30), status: UtilityBillStatus.PAID,
    paidAt: daysFromNow(-28),
  });

  // Equipment
  await ensureEquipment({
    companyId: companyA.id, propertyId: p1, name: 'Air conditioner (Tadiran)',
    quantity: 3, condition: EquipmentCondition.GOOD, serialNumber: 'TAD-AC-88213',
  });
  await ensureEquipment({
    companyId: companyA.id, propertyId: p1, name: 'Refrigerator',
    quantity: 1, condition: EquipmentCondition.FAIR, serialNumber: 'LG-RF-40021',
    notes: 'Door seal worn, replace at next service.',
  });
  await ensureEquipment({
    companyId: companyA.id, propertyId: p1, name: 'Bunk beds',
    quantity: 6, condition: EquipmentCondition.NEW,
  });
  await ensureEquipment({
    companyId: companyA.id, propertyId: p2, name: 'Washing machine',
    quantity: 1, condition: EquipmentCondition.GOOD, serialNumber: 'SAM-WM-77120',
  });
  await ensureEquipment({
    companyId: companyA.id, propertyId: p2, name: 'Water heater (boiler)',
    quantity: 1, condition: EquipmentCondition.BROKEN,
    notes: 'Element failure reported — awaiting repair.',
  });

  // Guarantees
  await ensureGuarantee({
    companyId: companyA.id, propertyId: p1, type: GuaranteeType.BANK_GUARANTEE,
    amount: 15600, bank: 'Bank Hapoalim', expiryDate: daysFromNow(65),
    status: GuaranteeStatus.ACTIVE, notes: 'Three months rent.',
  });
  await ensureGuarantee({
    companyId: companyA.id, propertyId: p2, type: GuaranteeType.CASH_DEPOSIT,
    amount: 9600, expiryDate: daysFromNow(145), status: GuaranteeStatus.ACTIVE,
    notes: 'Two months rent held on deposit.',
  });

  // Expenses
  await ensureExpense({
    companyId: companyA.id, propertyId: p1, category: ExpenseCategory.CLEANING,
    amount: 380, date: daysFromNow(-15), notes: 'Monthly common-area cleaning.',
  });
  await ensureExpense({
    companyId: companyA.id, propertyId: p1, category: ExpenseCategory.MAINTENANCE,
    amount: 720, date: daysFromNow(-9), notes: 'Plumbing repair, kitchen sink.',
  });
  await ensureExpense({
    companyId: companyA.id, propertyId: p2, category: ExpenseCategory.PEST_CONTROL,
    amount: 450, date: daysFromNow(-22), notes: 'Quarterly extermination.',
  });

  // Inspections
  await ensureInspection({
    companyId: companyA.id, propertyId: p1, lastInspectionDate: daysFromNow(-60),
    nextInspectionDate: daysFromNow(30), notes: 'Routine occupancy & safety check.',
  });
  await ensureInspection({
    companyId: companyA.id, propertyId: p2, lastInspectionDate: daysFromNow(-45),
    nextInspectionDate: daysFromNow(45), notes: 'Follow up on boiler repair.',
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
  const bProp1 = await ensureFullProperty({
    companyId: companyB.id,
    city: 'Jerusalem',
    address: '5 Jaffa St, Apt 7',
    entryCode: '7788#',
    electricMeter: 'EM-JM-100234',
    waterMeter: 'WM-JM-500981',
    ownerName: 'Sarah Cohen',
    ownerPhone: '058-220-1145',
    contractStart: daysFromNow(-90),
    contractEnd: daysFromNow(275),
    monthlyRent: 5500,
    rooms: 3,
    maxCapacity: 4,
    total: 1,
    notes: 'Company B tenant — used for cross-tenant isolation checks.',
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
  console.log('    + 4 properties (P1 Tel Aviv & P2 Bat Yam FULL w/ sub-resources,');
  console.log('      P3 Netanya partial, P4 Ashdod vacant)');
  console.log('    + 15 foreign workers (6→P1, 5→P2, 2→P3, 2 unassigned)');
  console.log('    + utility bills, equipment, guarantees, expenses, inspections, payments');
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

import prisma from '../../lib/prisma';
import { encryptField, decryptField } from '../../shared/utils/fieldEncryption';

/**
 * Foreign-worker records, tenant-isolated by `companyId` (mirrors the Property
 * repository). This layer also owns the FIELD-ENCRYPTION seam: the two regulated
 * identifiers (passport number, insurance policy number) are encrypted before
 * they hit the DB and decrypted only for a single-record read. Everything above
 * this layer works with PLAINTEXT DTOs and never sees the `*Enc` columns.
 */

/**
 * Full worker record returned on detail reads (GET /:id) and after writes. The
 * two identifiers are DECRYPTED plaintext here — this shape is only ever built
 * for an authorized single-record read, never for the list.
 */
export interface WorkerRecord {
  id: number;
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate: Date | null;
  preferredLanguage: string | null;
  passportNumber: string | null;
  passportExpiry: Date | null;
  visaType: string | null;
  visaExpiry: Date | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceCoverageType: string | null;
  insuranceExpiry: Date | null;
  phone: string | null;
  employer: string | null;
  propertyId: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List projection (data minimization, SECURITY_PRINCIPLES.md §7). Omits the two
 * regulated identifiers entirely — they never leave the DB in a bulk list read,
 * mirroring how the Property list omits `entryCode`. The expiry DATES are kept so
 * the client can render the 90/60/30-day alerts.
 */
export type WorkerListItem = Omit<WorkerRecord, 'passportNumber' | 'insurancePolicyNumber'>;

/** Writable fields on create. `companyId` is supplied by the service from the
 * trusted current user — never part of the request DTO. Identifiers are plaintext. */
export interface CreateWorkerData {
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate?: Date;
  preferredLanguage?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  visaType?: string;
  visaExpiry?: Date;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceCoverageType?: string;
  insuranceExpiry?: Date;
  phone?: string;
  employer?: string;
  propertyId?: number | null;
  notes?: string;
}

/** Writable fields on update — same set minus ownership, all optional. */
export type UpdateWorkerData = Partial<Omit<CreateWorkerData, 'companyId'>>;

export interface IWorkersRepository {
  listByCompany(companyId: number): Promise<WorkerListItem[]>;
  findByIdInCompany(id: number, companyId: number): Promise<WorkerRecord | null>;
  createInCompany(data: CreateWorkerData): Promise<WorkerRecord>;
  updateInCompany(
    id: number,
    companyId: number,
    data: UpdateWorkerData,
  ): Promise<WorkerRecord | null>;
  deleteInCompany(id: number, companyId: number): Promise<boolean>;
}

/** Columns selected for the list projection — the encrypted `*Enc` columns are
 * deliberately absent so they never leave the DB in bulk. */
const LIST_SELECT = {
  id: true,
  companyId: true,
  nameHe: true,
  nameEn: true,
  nationality: true,
  entryDate: true,
  preferredLanguage: true,
  passportExpiry: true,
  visaType: true,
  visaExpiry: true,
  insuranceProvider: true,
  insuranceCoverageType: true,
  insuranceExpiry: true,
  phone: true,
  employer: true,
  propertyId: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Shape of the persisted row (encrypted identifiers) as Prisma returns it. */
interface WorkerRow {
  id: number;
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate: Date | null;
  preferredLanguage: string | null;
  passportNumberEnc: string | null;
  passportExpiry: Date | null;
  visaType: string | null;
  visaExpiry: Date | null;
  insuranceProvider: string | null;
  insurancePolicyNumEnc: string | null;
  insuranceCoverageType: string | null;
  insuranceExpiry: Date | null;
  phone: string | null;
  employer: string | null;
  propertyId: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a persisted row to the detail record, DECRYPTING the two identifiers. */
function toRecord(row: WorkerRow): WorkerRecord {
  const { passportNumberEnc, insurancePolicyNumEnc, ...rest } = row;
  return {
    ...rest,
    passportNumber: passportNumberEnc ? decryptField(passportNumberEnc) : null,
    insurancePolicyNumber: insurancePolicyNumEnc ? decryptField(insurancePolicyNumEnc) : null,
  };
}

/** Translate a plaintext write DTO into persisted columns, ENCRYPTING the two
 * identifiers. `undefined` fields are left untouched (partial updates); an
 * explicit empty string clears the value. */
function toColumns(
  data: CreateWorkerData | UpdateWorkerData,
): Record<string, unknown> {
  const { passportNumber, insurancePolicyNumber, ...rest } = data as CreateWorkerData;
  const columns: Record<string, unknown> = { ...rest };
  if (passportNumber !== undefined) {
    columns['passportNumberEnc'] = passportNumber ? encryptField(passportNumber) : null;
  }
  if (insurancePolicyNumber !== undefined) {
    columns['insurancePolicyNumEnc'] = insurancePolicyNumber
      ? encryptField(insurancePolicyNumber)
      : null;
  }
  return columns;
}

export class WorkersRepository implements IWorkersRepository {
  async listByCompany(companyId: number): Promise<WorkerListItem[]> {
    // Tenant condition is part of the query; `select` omits the encrypted
    // identifier columns so they never leave the DB in a list read.
    return prisma.worker.findMany({
      where: { companyId },
      orderBy: { id: 'asc' },
      select: LIST_SELECT,
    });
  }

  async findByIdInCompany(id: number, companyId: number): Promise<WorkerRecord | null> {
    // A foreign-company id misses and returns null (404 upstream) — never leaks.
    const row = (await prisma.worker.findFirst({ where: { id, companyId } })) as WorkerRow | null;
    return row ? toRecord(row) : null;
  }

  async createInCompany(data: CreateWorkerData): Promise<WorkerRecord> {
    const row = (await prisma.worker.create({
      data: toColumns(data) as never,
    })) as WorkerRow;
    return toRecord(row);
  }

  async updateInCompany(
    id: number,
    companyId: number,
    data: UpdateWorkerData,
  ): Promise<WorkerRecord | null> {
    // `updateMany` keeps the tenant condition inside the write; a foreign-company
    // target matches zero rows (404 upstream) and is never mutated.
    const result = await prisma.worker.updateMany({
      where: { id, companyId },
      data: toColumns(data) as never,
    });
    if (result.count === 0) return null;
    return this.findByIdInCompany(id, companyId);
  }

  async deleteInCompany(id: number, companyId: number): Promise<boolean> {
    const result = await prisma.worker.deleteMany({ where: { id, companyId } });
    return result.count > 0;
  }
}

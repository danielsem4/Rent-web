import prisma from '../../lib/prisma';

/**
 * Full property record as returned on detail reads (GET /:id) and after writes.
 * Includes `entryCode` — a protected asset — so it is used only for single-record
 * responses to an authorized tenant member, never for the list projection.
 */
export interface PropertyRecord {
  id: number;
  companyId: number;
  city: string;
  address: string;
  entryCode: string | null;
  electricMeter: string | null;
  waterMeter: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  monthlyRent: number;
  maxCapacity: number;
  total: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List projection (data minimization, SECURITY_PRINCIPLES.md §7). Omits
 * `entryCode` — the physical-access secret is never returned in bulk list
 * responses; it is disclosed only on an explicit single-record read.
 */
export type PropertyListItem = Omit<PropertyRecord, 'entryCode'>;

/** Writable fields on create. `companyId` is supplied by the service from the
 * trusted current user — it is NOT part of the request DTO. */
export interface CreatePropertyData {
  companyId: number;
  city: string;
  address: string;
  entryCode?: string;
  electricMeter?: string;
  waterMeter?: string;
  ownerName?: string;
  ownerPhone?: string;
  contractStart?: Date;
  contractEnd?: Date;
  monthlyRent?: number;
  maxCapacity?: number;
  total?: number;
  notes?: string;
}

/** Writable fields on update — same set minus ownership, all optional. */
export type UpdatePropertyData = Partial<Omit<CreatePropertyData, 'companyId'>>;

export interface IPropertiesRepository {
  listByCompany(companyId: number): Promise<PropertyListItem[]>;
  findByIdInCompany(id: number, companyId: number): Promise<PropertyRecord | null>;
  createInCompany(data: CreatePropertyData): Promise<PropertyRecord>;
  updateInCompany(
    id: number,
    companyId: number,
    data: UpdatePropertyData,
  ): Promise<PropertyRecord | null>;
  deleteInCompany(id: number, companyId: number): Promise<boolean>;
}

export class PropertiesRepository implements IPropertiesRepository {
  async listByCompany(companyId: number): Promise<PropertyListItem[]> {
    // Tenant condition is part of the query — never a post-fetch filter. The
    // `select` omits `entryCode` so the secret never leaves the DB in list reads.
    return prisma.property.findMany({
      where: { companyId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        companyId: true,
        city: true,
        address: true,
        electricMeter: true,
        waterMeter: true,
        ownerName: true,
        ownerPhone: true,
        contractStart: true,
        contractEnd: true,
        monthlyRent: true,
        maxCapacity: true,
        total: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByIdInCompany(id: number, companyId: number): Promise<PropertyRecord | null> {
    // `findFirst` with both conditions: a foreign-company id simply misses and
    // returns null (a 404 upstream), never revealing that the row exists.
    return prisma.property.findFirst({ where: { id, companyId } });
  }

  async createInCompany(data: CreatePropertyData): Promise<PropertyRecord> {
    return prisma.property.create({ data });
  }

  async updateInCompany(
    id: number,
    companyId: number,
    data: UpdatePropertyData,
  ): Promise<PropertyRecord | null> {
    // `updateMany` keeps the tenant condition inside the write itself — a
    // foreign-company target matches zero rows (count 0 → 404 upstream) and is
    // never mutated. No findUnique-then-check.
    const result = await prisma.property.updateMany({ where: { id, companyId }, data });
    if (result.count === 0) return null;
    return this.findByIdInCompany(id, companyId);
  }

  async deleteInCompany(id: number, companyId: number): Promise<boolean> {
    // `deleteMany` scopes the delete by tenant — a foreign-company id deletes
    // zero rows (count 0 → 404 upstream), so one tenant can never delete
    // another's property.
    const result = await prisma.property.deleteMany({ where: { id, companyId } });
    return result.count > 0;
  }
}

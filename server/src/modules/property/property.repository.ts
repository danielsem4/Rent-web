import prisma from '../../lib/prisma';
import type { CreatePropertyDto, UpdatePropertyDto } from './property.schema';

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
  capacity: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPropertyRepository {
  findAllByCompany(companyId: number): Promise<PropertyRecord[]>;
  findByIdInCompany(id: number, companyId: number): Promise<PropertyRecord | null>;
  create(companyId: number, data: CreatePropertyDto): Promise<PropertyRecord>;
  update(id: number, companyId: number, data: UpdatePropertyDto): Promise<PropertyRecord | null>;
  deleteInCompany(id: number, companyId: number): Promise<boolean>;
  countByCompany(companyId: number): Promise<number>;
}

/**
 * The ONLY layer that touches prisma. Every query is scoped by companyId —
 * this is the multi-tenant isolation boundary. No unscoped reads/writes.
 */
export class PropertyRepository implements IPropertyRepository {
  findAllByCompany(companyId: number): Promise<PropertyRecord[]> {
    return prisma.property.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdInCompany(id: number, companyId: number): Promise<PropertyRecord | null> {
    return prisma.property.findFirst({ where: { id, companyId } });
  }

  create(companyId: number, data: CreatePropertyDto): Promise<PropertyRecord> {
    return prisma.property.create({ data: { ...data, companyId } });
  }

  async update(
    id: number,
    companyId: number,
    data: UpdatePropertyDto,
  ): Promise<PropertyRecord | null> {
    // updateMany scopes by companyId; only then re-read the row.
    const result = await prisma.property.updateMany({ where: { id, companyId }, data });
    if (result.count === 0) return null;
    return this.findByIdInCompany(id, companyId);
  }

  async deleteInCompany(id: number, companyId: number): Promise<boolean> {
    const result = await prisma.property.deleteMany({ where: { id, companyId } });
    return result.count > 0;
  }

  countByCompany(companyId: number): Promise<number> {
    return prisma.property.count({ where: { companyId } });
  }
}

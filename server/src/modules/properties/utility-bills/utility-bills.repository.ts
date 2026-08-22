import prisma from '../../../lib/prisma';
import type { UtilityType, UtilityBillStatus } from '@prisma/client';

/**
 * Utility-bill store, tenant-isolated by `companyId` AND scoped to a parent
 * `propertyId` (both denormalized onto the row, mirroring Payment). Every query
 * carries both conditions inside the WHERE — never a post-fetch filter — so a
 * foreign-company or wrong-property id simply misses (null / count 0 → 404).
 */

export interface UtilityBillRecord {
  id: number;
  companyId: number;
  propertyId: number;
  type: UtilityType;
  status: UtilityBillStatus;
  amount: number;
  dueDate: Date;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUtilityBillData {
  companyId: number;
  propertyId: number;
  type: UtilityType;
  status?: UtilityBillStatus;
  amount: number;
  dueDate: Date;
  paidAt?: Date;
  notes?: string;
}

export type UpdateUtilityBillData = Partial<
  Omit<CreateUtilityBillData, 'companyId' | 'propertyId'>
>;

export interface IUtilityBillsRepository {
  listByProperty(propertyId: number, companyId: number): Promise<UtilityBillRecord[]>;
  findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<UtilityBillRecord | null>;
  createInScope(data: CreateUtilityBillData): Promise<UtilityBillRecord>;
  updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateUtilityBillData,
  ): Promise<UtilityBillRecord | null>;
  deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

export class UtilityBillsRepository implements IUtilityBillsRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<UtilityBillRecord[]> {
    return prisma.utilityBill.findMany({
      where: { companyId, propertyId },
      orderBy: { dueDate: 'desc' },
    });
  }

  async findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<UtilityBillRecord | null> {
    return prisma.utilityBill.findFirst({ where: { id, companyId, propertyId } });
  }

  async createInScope(data: CreateUtilityBillData): Promise<UtilityBillRecord> {
    return prisma.utilityBill.create({ data });
  }

  async updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateUtilityBillData,
  ): Promise<UtilityBillRecord | null> {
    const result = await prisma.utilityBill.updateMany({
      where: { id, companyId, propertyId },
      data,
    });
    if (result.count === 0) return null;
    return this.findByIdInScope(id, propertyId, companyId);
  }

  async deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.utilityBill.deleteMany({ where: { id, companyId, propertyId } });
    return result.count > 0;
  }
}

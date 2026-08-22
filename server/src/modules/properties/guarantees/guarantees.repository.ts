import prisma from '../../../lib/prisma';
import type { GuaranteeType, GuaranteeStatus } from '@prisma/client';

/**
 * Guarantee/deposit store, tenant-isolated by `companyId` AND scoped to a parent
 * `propertyId` (both in every WHERE).
 */

export interface GuaranteeRecord {
  id: number;
  companyId: number;
  propertyId: number;
  type: GuaranteeType;
  amount: number;
  bank: string | null;
  expiryDate: Date | null;
  returnDate: Date | null;
  status: GuaranteeStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGuaranteeData {
  companyId: number;
  propertyId: number;
  type: GuaranteeType;
  amount: number;
  bank?: string;
  expiryDate?: Date;
  returnDate?: Date;
  status?: GuaranteeStatus;
  notes?: string;
}

export type UpdateGuaranteeData = Partial<Omit<CreateGuaranteeData, 'companyId' | 'propertyId'>>;

export interface IGuaranteesRepository {
  listByProperty(propertyId: number, companyId: number): Promise<GuaranteeRecord[]>;
  findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<GuaranteeRecord | null>;
  createInScope(data: CreateGuaranteeData): Promise<GuaranteeRecord>;
  updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateGuaranteeData,
  ): Promise<GuaranteeRecord | null>;
  deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

export class GuaranteesRepository implements IGuaranteesRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<GuaranteeRecord[]> {
    return prisma.guarantee.findMany({
      where: { companyId, propertyId },
      orderBy: { id: 'asc' },
    });
  }

  async findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<GuaranteeRecord | null> {
    return prisma.guarantee.findFirst({ where: { id, companyId, propertyId } });
  }

  async createInScope(data: CreateGuaranteeData): Promise<GuaranteeRecord> {
    return prisma.guarantee.create({ data });
  }

  async updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateGuaranteeData,
  ): Promise<GuaranteeRecord | null> {
    const result = await prisma.guarantee.updateMany({
      where: { id, companyId, propertyId },
      data,
    });
    if (result.count === 0) return null;
    return this.findByIdInScope(id, propertyId, companyId);
  }

  async deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.guarantee.deleteMany({ where: { id, companyId, propertyId } });
    return result.count > 0;
  }
}

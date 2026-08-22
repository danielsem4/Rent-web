import prisma from '../../../lib/prisma';
import type { EquipmentCondition } from '@prisma/client';

/**
 * Equipment store, tenant-isolated by `companyId` AND scoped to a parent
 * `propertyId` (both in every WHERE — never a post-fetch filter).
 */

export interface EquipmentRecord {
  id: number;
  companyId: number;
  propertyId: number;
  name: string;
  quantity: number;
  condition: EquipmentCondition;
  serialNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEquipmentData {
  companyId: number;
  propertyId: number;
  name: string;
  quantity?: number;
  condition?: EquipmentCondition;
  serialNumber?: string;
  notes?: string;
}

export type UpdateEquipmentData = Partial<Omit<CreateEquipmentData, 'companyId' | 'propertyId'>>;

export interface IEquipmentRepository {
  listByProperty(propertyId: number, companyId: number): Promise<EquipmentRecord[]>;
  findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<EquipmentRecord | null>;
  createInScope(data: CreateEquipmentData): Promise<EquipmentRecord>;
  updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateEquipmentData,
  ): Promise<EquipmentRecord | null>;
  deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

export class EquipmentRepository implements IEquipmentRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<EquipmentRecord[]> {
    return prisma.equipment.findMany({
      where: { companyId, propertyId },
      orderBy: { id: 'asc' },
    });
  }

  async findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<EquipmentRecord | null> {
    return prisma.equipment.findFirst({ where: { id, companyId, propertyId } });
  }

  async createInScope(data: CreateEquipmentData): Promise<EquipmentRecord> {
    return prisma.equipment.create({ data });
  }

  async updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateEquipmentData,
  ): Promise<EquipmentRecord | null> {
    const result = await prisma.equipment.updateMany({
      where: { id, companyId, propertyId },
      data,
    });
    if (result.count === 0) return null;
    return this.findByIdInScope(id, propertyId, companyId);
  }

  async deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.equipment.deleteMany({ where: { id, companyId, propertyId } });
    return result.count > 0;
  }
}

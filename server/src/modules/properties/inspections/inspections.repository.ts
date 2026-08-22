import prisma from '../../../lib/prisma';

/**
 * Periodic-inspection store, tenant-isolated by `companyId` AND scoped to a
 * parent `propertyId` (both in every WHERE).
 */

export interface InspectionRecord {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: Date | null;
  nextInspectionDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInspectionData {
  companyId: number;
  propertyId: number;
  lastInspectionDate?: Date;
  nextInspectionDate?: Date;
  notes?: string;
}

export type UpdateInspectionData = Partial<Omit<CreateInspectionData, 'companyId' | 'propertyId'>>;

export interface IInspectionsRepository {
  listByProperty(propertyId: number, companyId: number): Promise<InspectionRecord[]>;
  findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<InspectionRecord | null>;
  createInScope(data: CreateInspectionData): Promise<InspectionRecord>;
  updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateInspectionData,
  ): Promise<InspectionRecord | null>;
  deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

export class InspectionsRepository implements IInspectionsRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<InspectionRecord[]> {
    return prisma.inspection.findMany({
      where: { companyId, propertyId },
      orderBy: { nextInspectionDate: 'desc' },
    });
  }

  async findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<InspectionRecord | null> {
    return prisma.inspection.findFirst({ where: { id, companyId, propertyId } });
  }

  async createInScope(data: CreateInspectionData): Promise<InspectionRecord> {
    return prisma.inspection.create({ data });
  }

  async updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateInspectionData,
  ): Promise<InspectionRecord | null> {
    const result = await prisma.inspection.updateMany({
      where: { id, companyId, propertyId },
      data,
    });
    if (result.count === 0) return null;
    return this.findByIdInScope(id, propertyId, companyId);
  }

  async deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.inspection.deleteMany({ where: { id, companyId, propertyId } });
    return result.count > 0;
  }
}

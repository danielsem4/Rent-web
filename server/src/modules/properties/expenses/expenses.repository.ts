import prisma from '../../../lib/prisma';
import type { ExpenseCategory } from '@prisma/client';

/**
 * Miscellaneous-expense store, tenant-isolated by `companyId` AND scoped to a
 * parent `propertyId` (both in every WHERE).
 */

export interface ExpenseRecord {
  id: number;
  companyId: number;
  propertyId: number;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExpenseData {
  companyId: number;
  propertyId: number;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  notes?: string;
}

export type UpdateExpenseData = Partial<Omit<CreateExpenseData, 'companyId' | 'propertyId'>>;

export interface IExpensesRepository {
  listByProperty(propertyId: number, companyId: number): Promise<ExpenseRecord[]>;
  findByIdInScope(id: number, propertyId: number, companyId: number): Promise<ExpenseRecord | null>;
  createInScope(data: CreateExpenseData): Promise<ExpenseRecord>;
  updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateExpenseData,
  ): Promise<ExpenseRecord | null>;
  deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

export class ExpensesRepository implements IExpensesRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<ExpenseRecord[]> {
    return prisma.expense.findMany({
      where: { companyId, propertyId },
      orderBy: { date: 'desc' },
    });
  }

  async findByIdInScope(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<ExpenseRecord | null> {
    return prisma.expense.findFirst({ where: { id, companyId, propertyId } });
  }

  async createInScope(data: CreateExpenseData): Promise<ExpenseRecord> {
    return prisma.expense.create({ data });
  }

  async updateInScope(
    id: number,
    propertyId: number,
    companyId: number,
    data: UpdateExpenseData,
  ): Promise<ExpenseRecord | null> {
    const result = await prisma.expense.updateMany({
      where: { id, companyId, propertyId },
      data,
    });
    if (result.count === 0) return null;
    return this.findByIdInScope(id, propertyId, companyId);
  }

  async deleteInScope(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.expense.deleteMany({ where: { id, companyId, propertyId } });
    return result.count > 0;
  }
}

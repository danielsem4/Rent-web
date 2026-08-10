import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import type { CreateCompanyDto, UpdateCompanyDto } from './company.schema';

export interface CompanyManager {
  id: number;
  name: string;
  email: string;
}

export interface CompanyRecord {
  id: number;
  name: string;
  createdAt: Date;
  // Zero or one manager user, selected via `take: 1` below.
  users: CompanyManager[];
}

export interface ICompanyRepository {
  findAll(): Promise<CompanyRecord[]>;
  findById(id: number): Promise<CompanyRecord | null>;
  create(data: CreateCompanyDto): Promise<CompanyRecord>;
  update(id: number, data: UpdateCompanyDto): Promise<CompanyRecord | null>;
  deleteById(id: number): Promise<boolean>;
}

// Selects the company plus its manager (first COMPANY_MANAGER user).
const companySelect = {
  id: true,
  name: true,
  createdAt: true,
  users: {
    where: { role: 'COMPANY_MANAGER' },
    select: { id: true, name: true, email: true },
    take: 1,
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.CompanySelect;

/**
 * Companies are a PLATFORM-level resource. Unlike every other repository, this
 * one is intentionally NOT scoped by companyId — it reads/writes across all
 * tenants. Safe only because every company route is gated to SUPER_ADMIN.
 */
export class CompanyRepository implements ICompanyRepository {
  findAll(): Promise<CompanyRecord[]> {
    return prisma.company.findMany({
      select: companySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: number): Promise<CompanyRecord | null> {
    return prisma.company.findUnique({ where: { id }, select: companySelect });
  }

  create(data: CreateCompanyDto): Promise<CompanyRecord> {
    return prisma.company.create({ data, select: companySelect });
  }

  async update(id: number, data: UpdateCompanyDto): Promise<CompanyRecord | null> {
    const result = await prisma.company.updateMany({ where: { id }, data });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async deleteById(id: number): Promise<boolean> {
    const result = await prisma.company.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

import prisma from '../../lib/prisma';
import { Role } from '../../shared/constants/roles';

/** A company row for the admin list, with its enabled modules + manager count. */
export interface CompanyListItem {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  moduleKeys: string[];
  managerCount: number;
}

/** A single company's manager (projection — never the password hash). */
export interface CompanyManager {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
}

/** Full company detail for the admin detail view. */
export interface CompanyDetail {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  moduleKeys: string[];
  managers: CompanyManager[];
}

/** What a declarative module-set actually changed (for per-module auditing). */
export interface ModuleSetChanges {
  newlyEnabled: string[];
  newlyDisabled: string[];
}

export interface CreateCompanyData {
  name: string;
  moduleKeys: string[];
}

export interface UpdateCompanyData {
  name?: string;
  isActive?: boolean;
}

export interface ICompaniesRepository {
  list(): Promise<CompanyListItem[]>;
  create(data: CreateCompanyData): Promise<CompanyDetail>;
  findById(id: number): Promise<CompanyDetail | null>;
  update(id: number, data: UpdateCompanyData): Promise<CompanyDetail | null>;
  setModules(id: number, moduleKeys: string[]): Promise<ModuleSetChanges | null>;
}

function enabledKeys(companyModules: { moduleKey: string }[]): string[] {
  return companyModules.map((m) => m.moduleKey);
}

export class CompaniesRepository implements ICompaniesRepository {
  async list(): Promise<CompanyListItem[]> {
    const companies = await prisma.company.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        companyModules: { where: { enabled: true }, select: { moduleKey: true } },
        _count: { select: { users: { where: { role: Role.COMPANY_MANAGER } } } },
      },
    });
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      createdAt: c.createdAt,
      moduleKeys: enabledKeys(c.companyModules),
      managerCount: c._count.users,
    }));
  }

  async create(data: CreateCompanyData): Promise<CompanyDetail> {
    const company = await prisma.company.create({
      data: {
        name: data.name,
        companyModules: {
          create: data.moduleKeys.map((moduleKey) => ({ moduleKey, enabled: true })),
        },
      },
      select: { id: true },
    });
    // Re-read through the same detail projection so the shape is identical.
    const detail = await this.findById(company.id);
    // Just created in the same request — guaranteed present.
    return detail as CompanyDetail;
  }

  async findById(id: number): Promise<CompanyDetail | null> {
    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        companyModules: { where: { enabled: true }, select: { moduleKey: true } },
        users: {
          where: { role: Role.COMPANY_MANAGER },
          orderBy: { id: 'asc' },
          select: { id: true, email: true, name: true, isActive: true },
        },
      },
    });
    if (!company) return null;
    return {
      id: company.id,
      name: company.name,
      isActive: company.isActive,
      createdAt: company.createdAt,
      moduleKeys: enabledKeys(company.companyModules),
      managers: company.users,
    };
  }

  async update(id: number, data: UpdateCompanyData): Promise<CompanyDetail | null> {
    const result = await prisma.company.updateMany({ where: { id }, data });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async setModules(id: number, moduleKeys: string[]): Promise<ModuleSetChanges | null> {
    const desired = new Set(moduleKeys);
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id }, select: { id: true } });
      if (!company) return null;

      const existing = await tx.companyModule.findMany({
        where: { companyId: id },
        select: { moduleKey: true, enabled: true },
      });
      const existingByKey = new Map(existing.map((r) => [r.moduleKey, r.enabled]));

      const newlyEnabled: string[] = [];
      const newlyDisabled: string[] = [];

      // Enable (upsert) every desired key that is not already enabled.
      for (const key of desired) {
        if (existingByKey.get(key) !== true) newlyEnabled.push(key);
        await tx.companyModule.upsert({
          where: { companyId_moduleKey: { companyId: id, moduleKey: key } },
          create: { companyId: id, moduleKey: key, enabled: true },
          update: { enabled: true },
        });
      }

      // Disable every currently-enabled key that is NOT in the desired set (the row
      // is kept with enabled:false so the toggle history stays auditable).
      for (const row of existing) {
        if (row.enabled && !desired.has(row.moduleKey)) {
          newlyDisabled.push(row.moduleKey);
          await tx.companyModule.update({
            where: { companyId_moduleKey: { companyId: id, moduleKey: row.moduleKey } },
            data: { enabled: false },
          });
        }
      }

      return { newlyEnabled, newlyDisabled };
    });
  }
}

import { AppError } from '../../shared/errors/AppError';
import type {
  CompanyManager,
  CompanyRecord,
  ICompanyRepository,
} from './company.repository';
import type { CreateCompanyDto, UpdateCompanyDto } from './company.schema';

export interface CompanyView {
  id: number;
  name: string;
  createdAt: Date;
  manager: CompanyManager | null;
}

function toView(record: CompanyRecord): CompanyView {
  const { users, ...rest } = record;
  return { ...rest, manager: users[0] ?? null };
}

export class CompanyService {
  constructor(private readonly repo: ICompanyRepository) {}

  async list(): Promise<CompanyView[]> {
    const companies = await this.repo.findAll();
    return companies.map(toView);
  }

  async getById(id: number): Promise<CompanyView> {
    const company = await this.repo.findById(id);
    if (!company) {
      throw new AppError('Company not found', 404);
    }
    return toView(company);
  }

  async create(dto: CreateCompanyDto): Promise<CompanyView> {
    const company = await this.repo.create(dto);
    return toView(company);
  }

  async update(id: number, dto: UpdateCompanyDto): Promise<CompanyView> {
    const updated = await this.repo.update(id, dto);
    if (!updated) {
      throw new AppError('Company not found', 404);
    }
    return toView(updated);
  }

  async remove(id: number, currentCompanyId: number): Promise<void> {
    // Deleting a company cascades to its users and properties — refusing to
    // delete the actor's own company prevents self-lockout.
    if (id === currentCompanyId) {
      throw new AppError('You cannot delete your own company', 400);
    }
    const ok = await this.repo.deleteById(id);
    if (!ok) {
      throw new AppError('Company not found', 404);
    }
  }
}

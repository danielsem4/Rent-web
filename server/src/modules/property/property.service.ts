import { AppError } from '../../shared/errors/AppError';
import type { IPropertyRepository, PropertyRecord } from './property.repository';
import type { CreatePropertyDto, UpdatePropertyDto } from './property.schema';

export interface PropertyStats {
  activeApartments: number;
  openTickets: number; // placeholder — real count arrives with the Tickets slice
  collectionRate: number | null; // placeholder — computed with the Ledger slice
}

export class PropertyService {
  constructor(private readonly repo: IPropertyRepository) {}

  list(companyId: number): Promise<PropertyRecord[]> {
    return this.repo.findAllByCompany(companyId);
  }

  async getById(id: number, companyId: number): Promise<PropertyRecord> {
    const property = await this.repo.findByIdInCompany(id, companyId);
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    return property;
  }

  create(companyId: number, dto: CreatePropertyDto): Promise<PropertyRecord> {
    return this.repo.create(companyId, dto);
  }

  async update(id: number, companyId: number, dto: UpdatePropertyDto): Promise<PropertyRecord> {
    const updated = await this.repo.update(id, companyId, dto);
    if (!updated) {
      throw new AppError('Property not found', 404);
    }
    return updated;
  }

  async remove(id: number, companyId: number): Promise<void> {
    const ok = await this.repo.deleteInCompany(id, companyId);
    if (!ok) {
      throw new AppError('Property not found', 404);
    }
  }

  async stats(companyId: number): Promise<PropertyStats> {
    const activeApartments = await this.repo.countByCompany(companyId);
    return {
      activeApartments,
      openTickets: 0, // TODO(tickets-slice): count OPEN/IN_PROGRESS tickets for the company
      collectionRate: null, // TODO(ledger-slice): paid vs. due for the current month
    };
  }
}

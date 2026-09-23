import type { CurrentUser } from '../../shared/middlewares/authenticate';
import type { IInspectionsRepository, InspectionListItem } from './inspections.repository';

/**
 * Inspections business logic. Read-only: lists the current company's periodic
 * inspections (the dashboard derives the "due soon" count client-side). Company
 * ownership always comes from the trusted `currentUser`, never the request.
 */
export class InspectionsService {
  constructor(private readonly repo: IInspectionsRepository) {}

  async list(currentUser: CurrentUser): Promise<InspectionListItem[]> {
    return this.repo.listByCompany(currentUser.companyId);
  }
}

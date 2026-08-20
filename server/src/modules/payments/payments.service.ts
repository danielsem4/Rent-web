import type { CurrentUser } from '../../shared/middlewares/authenticate';
import type { IPaymentsRepository, PaymentListItem } from './payments.repository';

/**
 * Payments business logic. Read-only for now: lists the current company's
 * payments (the dashboard filters to outstanding ones client-side). Company
 * ownership always comes from the trusted `currentUser`, never the request.
 */
export class PaymentsService {
  constructor(private readonly repo: IPaymentsRepository) {}

  async list(currentUser: CurrentUser): Promise<PaymentListItem[]> {
    return this.repo.listByCompany(currentUser.companyId);
  }
}

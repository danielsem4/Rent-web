import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import {
  assertPropertyInCompany,
  type IPropertyLookup,
} from '../shared/parentProperty';
import type {
  IUtilityBillsRepository,
  UtilityBillRecord,
} from './utility-bills.repository';
import type { CreateUtilityBillDto, UpdateUtilityBillDto } from './utility-bills.schema';

/**
 * A utility bill enriched with a derived `overdue` flag. "Overdue" is a PENDING
 * bill whose dueDate is in the past — derived at read time, never stored
 * (mirrors the Payment "overdue" convention).
 */
export interface UtilityBillView extends UtilityBillRecord {
  overdue: boolean;
}

export class UtilityBillsService {
  constructor(
    private readonly repo: IUtilityBillsRepository,
    private readonly properties: IPropertyLookup,
    private readonly audit: IAuditLogger,
  ) {}

  async list(propertyId: number, currentUser: CurrentUser): Promise<UtilityBillView[]> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);
    const bills = await this.repo.listByProperty(propertyId, currentUser.companyId);
    return bills.map(withOverdue);
  }

  async get(
    propertyId: number,
    id: number,
    currentUser: CurrentUser,
  ): Promise<UtilityBillView> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);
    const bill = await this.repo.findByIdInScope(id, propertyId, currentUser.companyId);
    if (!bill) {
      throw new AppError('Utility bill not found', 404);
    }
    return withOverdue(bill);
  }

  async create(
    propertyId: number,
    dto: CreateUtilityBillDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<UtilityBillView> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);

    // Ownership + parent scope come from the trusted context/path, never the body.
    const bill = await this.repo.createInScope({
      ...dto,
      companyId: currentUser.companyId,
      propertyId,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.UTILITY_BILL_CREATED,
      resourceType: RESOURCE_TYPES.UTILITY_BILL,
      resourceId: String(bill.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId, fields: Object.keys(dto) },
    });
    return withOverdue(bill);
  }

  async update(
    propertyId: number,
    id: number,
    dto: UpdateUtilityBillDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<UtilityBillView> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);

    const updated = await this.repo.updateInScope(id, propertyId, currentUser.companyId, dto);
    if (!updated) {
      throw new AppError('Utility bill not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.UTILITY_BILL_UPDATED,
      resourceType: RESOURCE_TYPES.UTILITY_BILL,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId, fields: Object.keys(dto) },
    });
    return withOverdue(updated);
  }

  async remove(
    propertyId: number,
    id: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<void> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);

    const deleted = await this.repo.deleteInScope(id, propertyId, currentUser.companyId);
    if (!deleted) {
      throw new AppError('Utility bill not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.UTILITY_BILL_DELETED,
      resourceType: RESOURCE_TYPES.UTILITY_BILL,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId },
    });
  }
}

/** Derive the overdue flag: PENDING and past due. */
function withOverdue(bill: UtilityBillRecord): UtilityBillView {
  const overdue = bill.status === 'PENDING' && bill.dueDate.getTime() < Date.now();
  return { ...bill, overdue };
}

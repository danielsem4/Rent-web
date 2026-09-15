import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import { assertPropertyInCompany, type IPropertyLookup } from '../shared/parentProperty';
import type { IExpensesRepository, ExpenseRecord } from './expenses.repository';
import type { CreateExpenseDto, UpdateExpenseDto } from './expenses.schema';

export class ExpensesService {
  constructor(
    private readonly repo: IExpensesRepository,
    private readonly properties: IPropertyLookup,
    private readonly audit: IAuditLogger,
  ) {}

  async list(propertyId: number, currentUser: CurrentUser): Promise<ExpenseRecord[]> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);
    return this.repo.listByProperty(propertyId, currentUser.companyId);
  }

  async get(propertyId: number, id: number, currentUser: CurrentUser): Promise<ExpenseRecord> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);
    const item = await this.repo.findByIdInScope(id, propertyId, currentUser.companyId);
    if (!item) {
      throw new AppError('Expense not found', 404);
    }
    return item;
  }

  async create(
    propertyId: number,
    dto: CreateExpenseDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<ExpenseRecord> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);

    const item = await this.repo.createInScope({
      ...dto,
      companyId: currentUser.companyId,
      propertyId,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.EXPENSE_CREATED,
      resourceType: RESOURCE_TYPES.EXPENSE,
      resourceId: String(item.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId, fields: Object.keys(dto) },
    });
    return item;
  }

  async update(
    propertyId: number,
    id: number,
    dto: UpdateExpenseDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<ExpenseRecord> {
    await assertPropertyInCompany(this.properties, propertyId, currentUser.companyId);

    const updated = await this.repo.updateInScope(id, propertyId, currentUser.companyId, dto);
    if (!updated) {
      throw new AppError('Expense not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.EXPENSE_UPDATED,
      resourceType: RESOURCE_TYPES.EXPENSE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId, fields: Object.keys(dto) },
    });
    return updated;
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
      throw new AppError('Expense not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.EXPENSE_DELETED,
      resourceType: RESOURCE_TYPES.EXPENSE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId },
    });
  }
}

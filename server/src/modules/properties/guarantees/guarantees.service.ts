import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { tenantId } from '../../../shared/utils/tenant';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import { assertPropertyInCompany, type IPropertyLookup } from '../shared/parentProperty';
import type { IGuaranteesRepository, GuaranteeRecord } from './guarantees.repository';
import type { CreateGuaranteeDto, UpdateGuaranteeDto } from './guarantees.schema';

export class GuaranteesService {
  constructor(
    private readonly repo: IGuaranteesRepository,
    private readonly properties: IPropertyLookup,
    private readonly audit: IAuditLogger,
  ) {}

  async list(propertyId: number, currentUser: CurrentUser): Promise<GuaranteeRecord[]> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));
    return this.repo.listByProperty(propertyId, tenantId(currentUser));
  }

  async get(propertyId: number, id: number, currentUser: CurrentUser): Promise<GuaranteeRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));
    const item = await this.repo.findByIdInScope(id, propertyId, tenantId(currentUser));
    if (!item) {
      throw new AppError('Guarantee not found', 404);
    }
    return item;
  }

  async create(
    propertyId: number,
    dto: CreateGuaranteeDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<GuaranteeRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));

    const item = await this.repo.createInScope({
      ...dto,
      companyId: tenantId(currentUser),
      propertyId,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.GUARANTEE_CREATED,
      resourceType: RESOURCE_TYPES.GUARANTEE,
      resourceId: String(item.id),
      actor: { userId: currentUser.userId, companyId: tenantId(currentUser) },
      context,
      metadata: { propertyId, fields: Object.keys(dto) },
    });
    return item;
  }

  async update(
    propertyId: number,
    id: number,
    dto: UpdateGuaranteeDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<GuaranteeRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));

    const updated = await this.repo.updateInScope(id, propertyId, tenantId(currentUser), dto);
    if (!updated) {
      throw new AppError('Guarantee not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.GUARANTEE_UPDATED,
      resourceType: RESOURCE_TYPES.GUARANTEE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: tenantId(currentUser) },
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
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));

    const deleted = await this.repo.deleteInScope(id, propertyId, tenantId(currentUser));
    if (!deleted) {
      throw new AppError('Guarantee not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.GUARANTEE_DELETED,
      resourceType: RESOURCE_TYPES.GUARANTEE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: tenantId(currentUser) },
      context,
      metadata: { propertyId },
    });
  }
}

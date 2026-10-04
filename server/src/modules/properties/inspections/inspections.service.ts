import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { tenantId } from '../../../shared/utils/tenant';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import { assertPropertyInCompany, type IPropertyLookup } from '../shared/parentProperty';
import type { IInspectionsRepository, InspectionRecord } from './inspections.repository';
import type { CreateInspectionDto, UpdateInspectionDto } from './inspections.schema';

export class InspectionsService {
  constructor(
    private readonly repo: IInspectionsRepository,
    private readonly properties: IPropertyLookup,
    private readonly audit: IAuditLogger,
  ) {}

  async list(propertyId: number, currentUser: CurrentUser): Promise<InspectionRecord[]> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));
    return this.repo.listByProperty(propertyId, tenantId(currentUser));
  }

  async get(propertyId: number, id: number, currentUser: CurrentUser): Promise<InspectionRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));
    const item = await this.repo.findByIdInScope(id, propertyId, tenantId(currentUser));
    if (!item) {
      throw new AppError('Inspection not found', 404);
    }
    return item;
  }

  async create(
    propertyId: number,
    dto: CreateInspectionDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<InspectionRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));

    const item = await this.repo.createInScope({
      ...dto,
      companyId: tenantId(currentUser),
      propertyId,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.INSPECTION_CREATED,
      resourceType: RESOURCE_TYPES.INSPECTION,
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
    dto: UpdateInspectionDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<InspectionRecord> {
    await assertPropertyInCompany(this.properties, propertyId, tenantId(currentUser));

    const updated = await this.repo.updateInScope(id, propertyId, tenantId(currentUser), dto);
    if (!updated) {
      throw new AppError('Inspection not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.INSPECTION_UPDATED,
      resourceType: RESOURCE_TYPES.INSPECTION,
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
      throw new AppError('Inspection not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.INSPECTION_DELETED,
      resourceType: RESOURCE_TYPES.INSPECTION,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: tenantId(currentUser) },
      context,
      metadata: { propertyId },
    });
  }
}

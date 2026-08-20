import { AppError } from '../../shared/errors/AppError';
import type { CurrentUser } from '../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type {
  IPropertiesRepository,
  PropertyRecord,
  PropertyListItem,
} from './properties.repository';
import type { CreatePropertyDto, UpdatePropertyDto } from './properties.schema';

export class PropertiesService {
  constructor(
    private readonly repo: IPropertiesRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async list(currentUser: CurrentUser): Promise<PropertyListItem[]> {
    return this.repo.listByCompany(currentUser.companyId);
  }

  async get(id: number, currentUser: CurrentUser): Promise<PropertyRecord> {
    const property = await this.repo.findByIdInCompany(id, currentUser.companyId);
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    return property;
  }

  async create(
    dto: CreatePropertyDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<PropertyRecord> {
    // Company ownership always comes from the trusted context, never the body.
    const property = await this.repo.createInCompany({
      ...dto,
      companyId: currentUser.companyId,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.PROPERTY_CREATED,
      resourceType: RESOURCE_TYPES.PROPERTY,
      resourceId: String(property.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Field NAMES only — never values (entryCode / owner PII must not reach the trail).
      metadata: { fields: Object.keys(dto) },
    });
    return property;
  }

  async update(
    id: number,
    dto: UpdatePropertyDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<PropertyRecord> {
    const updated = await this.repo.updateInCompany(id, currentUser.companyId, dto);
    if (!updated) {
      throw new AppError('Property not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.PROPERTY_UPDATED,
      resourceType: RESOURCE_TYPES.PROPERTY,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Field NAMES only — never values.
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async remove(id: number, currentUser: CurrentUser, context: AuditContext): Promise<void> {
    const deleted = await this.repo.deleteInCompany(id, currentUser.companyId);
    if (!deleted) {
      throw new AppError('Property not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.PROPERTY_DELETED,
      resourceType: RESOURCE_TYPES.PROPERTY,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
    });
  }
}

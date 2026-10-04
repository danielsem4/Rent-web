import { AppError } from '../../shared/errors/AppError';
import { Role } from '../../shared/constants/roles';
import { hashPassword } from '../../shared/utils/password';
import { generateToken } from '../../shared/utils/token';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IInvitationIssuer } from '../account/account.service';
import type { IUsersRepository } from '../users/users.repository';
import type {
  CompanyDetail,
  CompanyListItem,
  CompanyManager,
  ICompaniesRepository,
} from './companies.repository';
import type { CreateCompanyDto, CreateManagerDto, SetModulesDto, UpdateCompanyDto } from './companies.schema';

/** The platform admin performing the action (SUPER_ADMIN; belongs to no company). */
export interface AdminActor {
  userId: number;
}

/**
 * Platform-admin business logic for managing companies and their feature-module
 * entitlements (SUPER_ADMIN only — gated at the router).
 *
 * CROSS-TENANT BY DESIGN: unlike every company-scoped service, the target company
 * comes from the `:id` path param, not `req.currentUser.companyId` (the super-admin
 * has none). The `authorize(SUPER_ADMIN)` route gate is the boundary. All actor
 * audit entries carry `companyId: null` (the platform actor is company-less).
 */
export class CompaniesService {
  constructor(
    private readonly repo: ICompaniesRepository,
    private readonly usersRepo: IUsersRepository,
    private readonly invitations: IInvitationIssuer,
    private readonly audit: IAuditLogger,
  ) {}

  async list(): Promise<CompanyListItem[]> {
    return this.repo.list();
  }

  async get(id: number): Promise<CompanyDetail> {
    const company = await this.repo.findById(id);
    if (!company) throw new AppError('Company not found', 404);
    return company;
  }

  async create(
    dto: CreateCompanyDto,
    actor: AdminActor,
    context: AuditContext,
  ): Promise<CompanyDetail> {
    const company = await this.repo.create({ name: dto.name, moduleKeys: dto.modules });

    await this.audit.log({
      action: AUDIT_ACTIONS.COMPANY_CREATED,
      resourceType: RESOURCE_TYPES.COMPANY,
      resourceId: String(company.id),
      actor: { userId: actor.userId, companyId: null },
      context,
      metadata: { name: company.name, modules: dto.modules },
    });

    if (dto.manager) {
      await this.provisionManager(company.id, dto.manager, actor, context);
    }
    // Re-read so the response reflects the newly-created manager (if any).
    return this.get(company.id);
  }

  async update(
    id: number,
    dto: UpdateCompanyDto,
    actor: AdminActor,
    context: AuditContext,
  ): Promise<CompanyDetail> {
    const before = await this.repo.findById(id);
    if (!before) throw new AppError('Company not found', 404);

    const updated = await this.repo.update(id, dto);
    if (!updated) throw new AppError('Company not found', 404);

    await this.audit.log({
      action: AUDIT_ACTIONS.COMPANY_UPDATED,
      resourceType: RESOURCE_TYPES.COMPANY,
      resourceId: String(id),
      actor: { userId: actor.userId, companyId: null },
      context,
      metadata: { fields: Object.keys(dto) },
    });

    // A change to the active flag is a privileged action — audit it distinctly so
    // locking a tenant out (or back in) is independently traceable.
    if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
      await this.audit.log({
        action: dto.isActive ? AUDIT_ACTIONS.COMPANY_ENABLED : AUDIT_ACTIONS.COMPANY_DISABLED,
        resourceType: RESOURCE_TYPES.COMPANY,
        resourceId: String(id),
        actor: { userId: actor.userId, companyId: null },
        context,
      });
    }
    return updated;
  }

  async setModules(
    id: number,
    dto: SetModulesDto,
    actor: AdminActor,
    context: AuditContext,
  ): Promise<CompanyDetail> {
    const changes = await this.repo.setModules(id, dto.modules);
    if (!changes) throw new AppError('Company not found', 404);

    for (const moduleKey of changes.newlyEnabled) {
      await this.audit.log({
        action: AUDIT_ACTIONS.COMPANY_MODULE_ENABLED,
        resourceType: RESOURCE_TYPES.COMPANY,
        resourceId: String(id),
        actor: { userId: actor.userId, companyId: null },
        context,
        metadata: { moduleKey },
      });
    }
    for (const moduleKey of changes.newlyDisabled) {
      await this.audit.log({
        action: AUDIT_ACTIONS.COMPANY_MODULE_DISABLED,
        resourceType: RESOURCE_TYPES.COMPANY,
        resourceId: String(id),
        actor: { userId: actor.userId, companyId: null },
        context,
        metadata: { moduleKey },
      });
    }
    return this.get(id);
  }

  async createManager(
    id: number,
    dto: CreateManagerDto,
    actor: AdminActor,
    context: AuditContext,
  ): Promise<CompanyManager> {
    const company = await this.repo.findById(id);
    if (!company) throw new AppError('Company not found', 404);
    return this.provisionManager(id, dto, actor, context);
  }

  /**
   * Create a company's COMPANY_MANAGER as a pending (invited) account and mail the
   * single-use invitation — reusing the same lifecycle as `UsersService.create`
   * (no plaintext password; placeholder hash; invitation issuer). SECURITY §3/§24.
   */
  private async provisionManager(
    companyId: number,
    dto: CreateManagerDto,
    actor: AdminActor,
    context: AuditContext,
  ): Promise<CompanyManager> {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new AppError('Email already in use', 409);

    const placeholderHash = await hashPassword(generateToken());
    const user = await this.usersRepo.create({
      email: dto.email,
      name: dto.name,
      role: Role.COMPANY_MANAGER,
      passwordHash: placeholderHash,
      companyId,
      isActive: false,
    });

    await this.audit.log({
      action: AUDIT_ACTIONS.COMPANY_MANAGER_CREATED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(user.id),
      actor: { userId: actor.userId, companyId: null },
      context,
      metadata: { companyId },
    });

    await this.invitations.issueInvitation(user.id, user.email, context);
    return { id: user.id, email: user.email, name: user.name, isActive: false };
  }
}

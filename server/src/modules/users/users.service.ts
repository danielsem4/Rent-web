import { AppError } from '../../shared/errors/AppError';
import type { CurrentUser } from '../../shared/middlewares/authenticate';
import type { SafeUser } from '../auth/auth.repository';
import { hashPassword } from '../../shared/utils/password';
import { generateToken } from '../../shared/utils/token';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IInvitationIssuer } from '../account/account.service';
import type { IUsersRepository } from './users.repository';
import type { CreateUserDto, UpdateUserDto } from './users.schema';

export class UsersService {
  constructor(
    private readonly repo: IUsersRepository,
    private readonly invitations: IInvitationIssuer,
    private readonly audit: IAuditLogger,
  ) {}

  async list(currentUser: CurrentUser): Promise<SafeUser[]> {
    return this.repo.listByCompany(currentUser.companyId);
  }

  async get(id: number, currentUser: CurrentUser): Promise<SafeUser> {
    const user = await this.repo.findByIdInCompany(id, currentUser.companyId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async create(
    dto: CreateUserDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<SafeUser> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new AppError('Email already in use', 409);
    }

    // No manager-chosen/plaintext password (SECURITY_PRINCIPLES.md §3/§24). The
    // user is created PENDING (isActive:false) with an UNUSABLE placeholder hash —
    // a real bcrypt hash of a random secret that no login input can match — so the
    // account cannot be logged into until the invitation is accepted. `authenticate`
    // and login already deny isActive:false with a generic 401 (enumeration-safe).
    const placeholderHash = await hashPassword(generateToken());
    const user = await this.repo.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      passwordHash: placeholderHash,
      // Company ownership always comes from the trusted context, never the body.
      companyId: currentUser.companyId,
      isActive: false,
    });

    // USER_CREATED is audited before issuing the invitation so the creation is
    // recorded even if invitation delivery later fails. Actor = the manager;
    // target = the new user.
    await this.audit.log({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(user.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { role: dto.role },
    });

    // Send the single-use invitation so the user can set their own password.
    await this.invitations.issueInvitation(user.id, user.email, context);
    return user;
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<SafeUser> {
    // Self-modification rule: a manager may edit their own profile but must NOT
    // change their own role through this endpoint, so the sole manager cannot
    // accidentally demote themselves and lock the company out.
    if (id === currentUser.userId && dto.role !== undefined) {
      throw new AppError('You cannot change your own role', 403);
    }

    if (dto.email !== undefined) {
      const existing = await this.repo.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new AppError('Email already in use', 409);
      }
    }

    const updated = await this.repo.updateInCompany(id, currentUser.companyId, dto);
    if (!updated) {
      throw new AppError('User not found', 404);
    }

    const actor = { userId: currentUser.userId, companyId: currentUser.companyId };
    await this.audit.log({
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(id),
      actor,
      context,
      metadata: { fields: Object.keys(dto) },
    });
    // A role change is a privileged action — audit it distinctly (§18).
    if (dto.role !== undefined) {
      await this.audit.log({
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: String(id),
        actor,
        context,
        metadata: { newRole: updated.role },
      });
    }
    return updated;
  }
}

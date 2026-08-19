import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError';
import type { CurrentUser } from '../../shared/middlewares/authenticate';
import type { SafeUser } from '../auth/auth.repository';
import type { IUsersRepository } from './users.repository';
import type { CreateUserDto, UpdateUserDto } from './users.schema';

// Matches the cost used by the seed's bcrypt.hash — keep in sync.
const SALT_ROUNDS = 10;

export class UsersService {
  constructor(private readonly repo: IUsersRepository) {}

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

  async create(dto: CreateUserDto, currentUser: CurrentUser): Promise<SafeUser> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new AppError('Email already in use', 409);
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    return this.repo.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      passwordHash,
      // Company ownership always comes from the trusted context, never the body.
      companyId: currentUser.companyId,
    });
  }

  async update(id: number, dto: UpdateUserDto, currentUser: CurrentUser): Promise<SafeUser> {
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
    return updated;
  }
}

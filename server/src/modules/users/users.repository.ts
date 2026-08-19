import prisma from '../../lib/prisma';
import { Role } from '../../shared/constants/roles';
// Reuse the existing passwordHash-free projection rather than duplicating an
// output model (see SafeUser in the auth module).
import type { SafeUser } from '../auth/auth.repository';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  companyId: number;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: Role;
}

export interface IUsersRepository {
  listByCompany(companyId: number): Promise<SafeUser[]>;
  findByIdInCompany(id: number, companyId: number): Promise<SafeUser | null>;
  findByEmail(email: string): Promise<{ id: number } | null>;
  create(data: CreateUserData): Promise<SafeUser>;
  updateInCompany(id: number, companyId: number, data: UpdateUserData): Promise<SafeUser | null>;
}

function toSafeUser(user: {
  id: number;
  email: string;
  name: string;
  role: Role;
  companyId: number;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  };
}

export class UsersRepository implements IUsersRepository {
  async listByCompany(companyId: number): Promise<SafeUser[]> {
    // Tenant condition is part of the query — never a post-fetch filter.
    const users = await prisma.user.findMany({
      where: { companyId },
      orderBy: { id: 'asc' },
    });
    return users.map(toSafeUser);
  }

  async findByIdInCompany(id: number, companyId: number): Promise<SafeUser | null> {
    // `findFirst` with both conditions: a foreign-company id simply misses and
    // returns null (a 404 upstream), never revealing that the row exists.
    const user = await prisma.user.findFirst({ where: { id, companyId } });
    return user ? toSafeUser(user) : null;
  }

  async findByEmail(email: string): Promise<{ id: number } | null> {
    // Email is globally unique — this is an existence/conflict check only and
    // deliberately not tenant-scoped.
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return user ? { id: user.id } : null;
  }

  async create(data: CreateUserData): Promise<SafeUser> {
    const user = await prisma.user.create({ data });
    return toSafeUser(user);
  }

  async updateInCompany(
    id: number,
    companyId: number,
    data: UpdateUserData,
  ): Promise<SafeUser | null> {
    // `updateMany` keeps the tenant condition inside the write itself — a
    // foreign-company target matches zero rows (count 0 → 404 upstream) and is
    // never mutated. No findUnique-then-check.
    const result = await prisma.user.updateMany({ where: { id, companyId }, data });
    if (result.count === 0) return null;
    return this.findByIdInCompany(id, companyId);
  }
}

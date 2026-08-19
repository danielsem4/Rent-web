import prisma from '../../lib/prisma';
import { Role } from '../../shared/constants/roles';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  companyId: number;
}

export interface SafeUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  companyId: number;
}

export interface IAuthRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<SafeUser | null>;
}

export class AuthRepository implements IAuthRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  }
}

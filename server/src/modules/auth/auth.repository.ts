import prisma from '../../lib/prisma';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  companyId: number;
}

export interface SafeUser {
  id: number;
  email: string;
  name: string;
  role: string;
  companyId: number;
}

export interface IAuthRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<SafeUser | null>;
  findRecordById(id: number): Promise<UserRecord | null>;
  updatePassword(id: number, passwordHash: string): Promise<void>;
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

  async findRecordById(id: number): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({ where: { id } });
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

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}

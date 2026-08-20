import prisma from '../../lib/prisma';
import { Role } from '../../shared/constants/roles';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  companyId: number;
  isActive: boolean;
  tokenVersion: number;
  isMfaEnabled: boolean;
}

export interface SafeUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  companyId: number;
}

/**
 * Server-side security state for a request. Loaded fresh from the DB by
 * `authenticate` on every protected request so account status, role, company,
 * and token version are always current — never trusted from the token's claims.
 * `tokenVersion` is internal (never projected to clients).
 */
export interface AuthState {
  id: number;
  role: Role;
  companyId: number;
  isActive: boolean;
  tokenVersion: number;
}

export interface IAuthRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<SafeUser | null>;
  findAuthById(id: number): Promise<AuthState | null>;
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
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      isMfaEnabled: user.isMfaEnabled,
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

  async findAuthById(id: number): Promise<AuthState | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      companyId: user.companyId,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
    };
  }
}

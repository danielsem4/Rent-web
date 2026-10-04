import prisma from '../../lib/prisma';
import { Role } from '../../shared/constants/roles';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  // null for a platform-scoped SUPER_ADMIN; a number for every other user.
  companyId: number | null;
  isActive: boolean;
  tokenVersion: number;
}

export interface SafeUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  // null for a platform-scoped SUPER_ADMIN (belongs to no company).
  companyId: number | null;
}

/**
 * A SafeUser plus the company's enabled feature-module keys — the shape returned
 * by login / `/me`. `enabledModules` drives client nav/route gating (UX only; the
 * server's requireModule is the real boundary) and is empty for a SUPER_ADMIN
 * (no company). Kept distinct from `SafeUser` so the plain user projection reused
 * by the users module stays free of company-level entitlement data.
 */
export interface AuthenticatedUser extends SafeUser {
  enabledModules: string[];
}

/**
 * Server-side security state for a request. Loaded fresh from the DB by
 * `authenticate` on every protected request so account status, role, company,
 * and token version are always current — never trusted from the token's claims.
 * `tokenVersion` is internal (never projected to clients).
 *
 * `companyActive` and `enabledModules` back modular multi-tenancy: a disabled
 * company locks out its users, and `enabledModules` is the fresh entitlement set
 * `requireModule` checks (loaded here so no extra per-request query is needed).
 */
export interface AuthState {
  id: number;
  role: Role;
  companyId: number | null;
  isActive: boolean;
  tokenVersion: number;
  // null when the user has no company (SUPER_ADMIN); otherwise the company flag.
  companyActive: boolean | null;
  enabledModules: string[];
}

export interface IAuthRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<AuthenticatedUser | null>;
  findAuthById(id: number): Promise<AuthState | null>;
}

/**
 * Prisma select for a user's company entitlement state. Kept in one place so the
 * auth read stays a single query that also carries the company's active flag and
 * its *enabled* module keys.
 */
const COMPANY_ENTITLEMENT_SELECT = {
  select: {
    isActive: true,
    companyModules: {
      where: { enabled: true },
      select: { moduleKey: true },
    },
  },
} as const;

type CompanyEntitlement = {
  isActive: boolean;
  companyModules: { moduleKey: string }[];
} | null;

function moduleKeysOf(company: CompanyEntitlement): string[] {
  return company ? company.companyModules.map((m) => m.moduleKey) : [];
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
    };
  }

  async findById(id: number): Promise<AuthenticatedUser | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { company: COMPANY_ENTITLEMENT_SELECT },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      enabledModules: moduleKeysOf(user.company),
    };
  }

  async findAuthById(id: number): Promise<AuthState | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { company: COMPANY_ENTITLEMENT_SELECT },
    });
    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      companyId: user.companyId,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      companyActive: user.company ? user.company.isActive : null,
      enabledModules: moduleKeysOf(user.company),
    };
  }
}

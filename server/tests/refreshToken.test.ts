import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { AuthService } from '../src/modules/auth/auth.service';
import type { IAuthRepository, UserRecord, AuthState, SafeUser } from '../src/modules/auth/auth.repository';
import type {
  IRefreshTokenRepository,
  RefreshTokenRecord,
  NewRefreshToken,
} from '../src/modules/auth/refreshToken.repository';
import type { AuditEvent, IAuditLogger } from '../src/shared/audit/auditLogger';
import { generateToken, hashToken } from '../src/shared/utils/token';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// AuthService refresh-token lifecycle as a pure service unit (no HTTP/prisma):
// fakes for IAuthRepository / IRefreshTokenRepository / IAuditLogger. This
// exercises rotation, reuse (breach) detection, expiry, disabled accounts, and
// the single-use race directly against the business logic.
// ---------------------------------------------------------------------------

const CTX = { ip: '203.0.113.5', userAgent: 'vitest', requestId: 'req-x' };

function authState(over: Partial<AuthState> = {}): AuthState {
  return { id: 1, role: Role.COMPANY_MANAGER, companyId: 7, isActive: true, tokenVersion: 3, ...over };
}

/** In-memory refresh-token repo keyed by tokenHash, with spies for assertions. */
function makeRefreshRepo() {
  const rows: RefreshTokenRecord[] = [];
  const spies = {
    create: vi.fn(async (t: NewRefreshToken) => {
      rows.push({ id: `id-${rows.length}`, userId: t.userId, familyId: t.familyId, isRevoked: false, expiresAt: t.expiresAt });
    }),
    findByHash: vi.fn(),
    rotate: vi.fn(async (oldId: string, next: NewRefreshToken) => {
      const old = rows.find((r) => r.id === oldId);
      if (!old || old.isRevoked) return false;
      old.isRevoked = true;
      rows.push({ id: `id-${rows.length}`, userId: next.userId, familyId: next.familyId, isRevoked: false, expiresAt: next.expiresAt });
      return true;
    }),
    revokeFamilyAndBumpUser: vi.fn(async () => {}),
    revokeAllForUser: vi.fn(async () => {}),
    revokeByHash: vi.fn(async () => {}),
  };
  const repo: IRefreshTokenRepository = spies;
  // Seed a stored token for `raw`, returning it from findByHash.
  function seed(raw: string, over: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
    const rec: RefreshTokenRecord = {
      id: 'seed-0',
      userId: 1,
      familyId: 'fam-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      ...over,
    };
    rows.push(rec);
    spies.findByHash.mockImplementation(async (h: string) => (h === hashToken(raw) ? rec : null));
    return rec;
  }
  return { repo, spies, rows, seed };
}

function makeAuthRepo(state: AuthState | null, record?: UserRecord): IAuthRepository {
  return {
    findByEmail: vi.fn(async () => record ?? null),
    findById: vi.fn(async () => null as SafeUser | null),
    findAuthById: vi.fn(async () => state),
  };
}

function makeAudit() {
  const events: AuditEvent[] = [];
  const audit: IAuditLogger = { log: vi.fn(async (e: AuditEvent) => { events.push(e); }) };
  return { audit, events };
}

describe('AuthService.refresh — rotation', () => {
  it('rotates a valid token: retires the old, issues a new one, re-signs from the DB row', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1, familyId: 'fam-1' });
    const { audit, events } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState({ role: Role.COMPANY_WORKER, companyId: 5, tokenVersion: 9 })), rt.repo, audit);

    const tokens = await service.refresh(raw, CTX);

    expect(rt.spies.rotate).toHaveBeenCalledTimes(1);
    // A brand-new raw refresh token is returned (rotation), different from the old.
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.refreshToken).not.toBe(raw);
    // Access token is re-signed from the CURRENT DB claims, not the old token.
    const decoded = jwt.decode(tokens.accessToken) as Record<string, unknown>;
    expect(decoded['role']).toBe('COMPANY_WORKER');
    expect(decoded['companyId']).toBe(5);
    expect(decoded['tokenVersion']).toBe(9);
    // Audited as a token refresh, not a breach.
    expect(events.map((e) => e.action)).toContain('AUTH_TOKEN_REFRESH');
    expect(rt.spies.revokeFamilyAndBumpUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh — reuse (breach) detection', () => {
  it('a REVOKED token triggers family revoke + tokenVersion bump and 401', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1, familyId: 'fam-9', isRevoked: true });
    const { audit, events } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);

    await expect(service.refresh(raw, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(rt.spies.revokeFamilyAndBumpUser).toHaveBeenCalledWith(1, 'fam-9');
    expect(rt.spies.rotate).not.toHaveBeenCalled();
    const breach = events.find((e) => e.action === 'SESSION_REVOKED');
    expect(breach?.metadata).toMatchObject({ reason: 'refresh_reuse_detected', familyId: 'fam-9' });
  });

  it('an EXPIRED token triggers mitigation with the expired reason and 401', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1, familyId: 'fam-2', expiresAt: new Date(Date.now() - 1000) });
    const { audit, events } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);

    await expect(service.refresh(raw, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(rt.spies.revokeFamilyAndBumpUser).toHaveBeenCalledWith(1, 'fam-2');
    expect(events.find((e) => e.action === 'SESSION_REVOKED')?.metadata).toMatchObject({ reason: 'refresh_expired' });
  });

  it('losing the single-use rotation race is treated as reuse (mitigation + 401)', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1, familyId: 'fam-3' });
    rt.spies.rotate.mockResolvedValueOnce(false); // concurrent rotation won
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);

    await expect(service.refresh(raw, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(rt.spies.revokeFamilyAndBumpUser).toHaveBeenCalledWith(1, 'fam-3');
  });
});

describe('AuthService.refresh — denial without mitigation', () => {
  it('an unknown token is denied (401) with no family to mitigate', async () => {
    const rt = makeRefreshRepo();
    rt.spies.findByHash.mockResolvedValue(null);
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);

    await expect(service.refresh(generateToken(), CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(rt.spies.revokeFamilyAndBumpUser).not.toHaveBeenCalled();
  });

  it('a missing refresh cookie is denied (401)', async () => {
    const rt = makeRefreshRepo();
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);
    await expect(service.refresh(undefined, CTX)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('a disabled account cannot refresh (401), and no new token is issued', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1, familyId: 'fam-4' });
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState({ isActive: false })), rt.repo, audit);

    await expect(service.refresh(raw, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(rt.spies.rotate).not.toHaveBeenCalled();
  });
});

describe('AuthService.login / logout — refresh-token issuance & revocation', () => {
  it('login mints a refresh token in a fresh family', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const record: UserRecord = {
      id: 1, email: 'm@test.dev', passwordHash, name: 'M', role: Role.COMPANY_MANAGER, companyId: 7, isActive: true, tokenVersion: 0,
    };
    const rt = makeRefreshRepo();
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState(), record), rt.repo, audit);

    const result = await service.login({ email: 'm@test.dev', password: 'password123' }, CTX);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(rt.spies.create).toHaveBeenCalledTimes(1);
    const created = rt.spies.create.mock.calls[0]![0] as NewRefreshToken;
    expect(created.userId).toBe(1);
    expect(created.familyId).toBeTruthy();
    // Only the HASH is persisted — never the raw token handed to the client.
    expect(created.tokenHash).toBe(hashToken(result.refreshToken));
    expect(created.tokenHash).not.toBe(result.refreshToken);
  });

  it('logout revokes the presented refresh token by hash and never throws', async () => {
    const raw = generateToken();
    const rt = makeRefreshRepo();
    rt.seed(raw, { userId: 1 });
    const { audit, events } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);

    await expect(service.logout(raw, CTX)).resolves.toBeUndefined();
    expect(rt.spies.revokeByHash).toHaveBeenCalledWith(hashToken(raw));
    expect(events.map((e) => e.action)).toContain('AUTH_LOGOUT');
  });

  it('logout with no refresh cookie still succeeds (no revoke call)', async () => {
    const rt = makeRefreshRepo();
    const { audit } = makeAudit();
    const service = new AuthService(makeAuthRepo(authState()), rt.repo, audit);
    await expect(service.logout(undefined, CTX)).resolves.toBeUndefined();
    expect(rt.spies.revokeByHash).not.toHaveBeenCalled();
  });
});

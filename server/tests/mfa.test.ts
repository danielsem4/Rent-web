import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AuthService } from '../src/modules/auth/auth.service';
import type { IAuthRepository, UserRecord, AuthState, SafeUser } from '../src/modules/auth/auth.repository';
import type { IRefreshTokenRepository } from '../src/modules/auth/refreshToken.repository';
import type { IMfaRepository, MfaContext } from '../src/modules/auth/mfa.repository';
import type { AuditEvent, IAuditLogger } from '../src/shared/audit/auditLogger';
import { signMfaToken } from '../src/shared/utils/mfaToken';
import { encryptSecret } from '../src/shared/utils/encryption';
import { generateTotpSecret } from '../src/shared/utils/totp';
import { hashRecoveryCode } from '../src/shared/utils/recoveryCodes';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// MFA logic as a pure AuthService unit (no HTTP/prisma). Real crypto/TOTP utils
// are used so the flow is authentic; repositories are in-memory fakes.
// ---------------------------------------------------------------------------

const CTX = { ip: '203.0.113.9', userAgent: 'vitest', requestId: 'req-mfa' };
const USER_ID = 1;
const COMPANY_ID = 7;

function authState(over: Partial<AuthState> = {}): AuthState {
  return { id: USER_ID, role: Role.COMPANY_MANAGER, companyId: COMPANY_ID, isActive: true, tokenVersion: 0, ...over };
}
function safeUser(over: Partial<SafeUser> = {}): SafeUser {
  return { id: USER_ID, email: 'm@test.dev', name: 'M', role: Role.COMPANY_MANAGER, companyId: COMPANY_ID, ...over };
}

function makeAuthRepo(opts: { record?: UserRecord; state?: AuthState; user?: SafeUser }): IAuthRepository {
  return {
    findByEmail: vi.fn(async () => opts.record ?? null),
    findById: vi.fn(async () => opts.user ?? null),
    findAuthById: vi.fn(async () => opts.state ?? null),
  };
}

const refreshRepo: IRefreshTokenRepository = {
  create: vi.fn(async () => {}),
  findByHash: vi.fn(async () => null),
  rotate: vi.fn(async () => true),
  revokeFamilyAndBumpUser: vi.fn(async () => {}),
  revokeAllForUser: vi.fn(async () => {}),
  revokeByHash: vi.fn(async () => {}),
};

function makeMfaRepo(initial: Partial<MfaContext> = {}, passwordHash?: string) {
  const s: MfaContext = {
    isMfaEnabled: initial.isMfaEnabled ?? false,
    mfaSecret: initial.mfaSecret ?? null,
    recoveryCodeHashes: initial.recoveryCodeHashes ?? [],
  };
  const spies = {
    getMfa: vi.fn(async () => ({ ...s })),
    getPasswordHash: vi.fn(async () => passwordHash ?? null),
    savePendingSecret: vi.fn(async (_id: number, enc: string, hashes: string[]) => {
      s.mfaSecret = enc;
      s.recoveryCodeHashes = hashes;
    }),
    enableMfa: vi.fn(async () => {
      s.isMfaEnabled = true;
    }),
    disableMfa: vi.fn(async () => {
      s.isMfaEnabled = false;
      s.mfaSecret = null;
      s.recoveryCodeHashes = [];
    }),
    consumeRecoveryCode: vi.fn(async (_id: number, hash: string) => {
      const i = s.recoveryCodeHashes.indexOf(hash);
      if (i < 0) return false;
      s.recoveryCodeHashes.splice(i, 1);
      return true;
    }),
  };
  return { repo: spies as IMfaRepository, spies, state: s };
}

function makeAudit() {
  const events: AuditEvent[] = [];
  const audit: IAuditLogger = { log: vi.fn(async (e: AuditEvent) => { events.push(e); }) };
  return { audit, events };
}

async function userRecord(over: Partial<UserRecord> = {}): Promise<UserRecord> {
  return {
    id: USER_ID,
    email: 'm@test.dev',
    passwordHash: await bcrypt.hash('password123', 10),
    name: 'M',
    role: Role.COMPANY_MANAGER,
    companyId: COMPANY_ID,
    isActive: true,
    tokenVersion: 0,
    isMfaEnabled: false,
    ...over,
  };
}

describe('AuthService.login — MFA branching', () => {
  it('privileged + not enrolled → enroll token (setupRequired), no session', async () => {
    const record = await userRecord({ role: Role.COMPANY_MANAGER, isMfaEnabled: false });
    const mfa = makeMfaRepo();
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ record }), refreshRepo, mfa.repo, audit);

    const result = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    expect(result.kind).toBe('mfa');
    if (result.kind !== 'mfa') throw new Error('expected mfa');
    expect(result.setupRequired).toBe(true);
    expect(typeof result.mfaToken).toBe('string');
  });

  it('enrolled → challenge token (no setupRequired)', async () => {
    const record = await userRecord({ role: Role.RENTER, isMfaEnabled: true });
    const mfa = makeMfaRepo({ isMfaEnabled: true });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ record }), refreshRepo, mfa.repo, audit);

    const result = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    expect(result.kind).toBe('mfa');
    if (result.kind !== 'mfa') throw new Error('expected mfa');
    expect(result.setupRequired).toBe(false);
  });

  it('non-privileged + MFA off → full session', async () => {
    const record = await userRecord({ role: Role.RENTER, isMfaEnabled: false });
    const mfa = makeMfaRepo();
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ record }), refreshRepo, mfa.repo, audit);

    const result = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    expect(result.kind).toBe('session');
  });
});

describe('AuthService.beginMfaSetup', () => {
  it('generates a secret + recovery codes and stores them ENCRYPTED/HASHED (pending)', async () => {
    const mfa = makeMfaRepo();
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ user: safeUser() }), refreshRepo, mfa.repo, audit);

    const data = await svc.beginMfaSetup(USER_ID);
    expect(data.otpauthUrl.startsWith('otpauth://totp/')).toBe(true);
    expect(data.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(data.recoveryCodes).toHaveLength(10);

    // Pending, NOT enabled; secret stored is ciphertext; codes stored are hashes.
    expect(mfa.state.isMfaEnabled).toBe(false);
    expect(mfa.state.mfaSecret).not.toBeNull();
    expect(mfa.state.mfaSecret).not.toContain(data.recoveryCodes[0]!);
    expect(mfa.state.recoveryCodeHashes).toEqual(data.recoveryCodes.map(hashRecoveryCode));
    expect(mfa.state.recoveryCodeHashes).not.toContain(data.recoveryCodes[0]);
  });

  it('rejects setup when MFA is already enabled (409)', async () => {
    const mfa = makeMfaRepo({ isMfaEnabled: true });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ user: safeUser() }), refreshRepo, mfa.repo, audit);
    await expect(svc.beginMfaSetup(USER_ID)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('AuthService.completeMfaSetup', () => {
  it('enables MFA on a valid code and issues a session in enroll mode', async () => {
    const secret = generateTotpSecret();
    const mfa = makeMfaRepo({ mfaSecret: encryptSecret(secret) });
    const { audit, events } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ state: authState(), user: safeUser() }), refreshRepo, mfa.repo, audit);

    const result = await svc.completeMfaSetup(USER_ID, authenticator.generate(secret), CTX, true);
    expect(mfa.spies.enableMfa).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.action)).toContain('MFA_SETUP_COMPLETED');
    expect(result?.kind).toBe('session');
  });

  it('does not issue a session outside enroll mode (voluntary enrollment)', async () => {
    const secret = generateTotpSecret();
    const mfa = makeMfaRepo({ mfaSecret: encryptSecret(secret) });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ state: authState(), user: safeUser() }), refreshRepo, mfa.repo, audit);

    const result = await svc.completeMfaSetup(USER_ID, authenticator.generate(secret), CTX, false);
    expect(result).toBeNull();
    expect(mfa.spies.enableMfa).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid code (400) and does not enable', async () => {
    const secret = generateTotpSecret();
    const mfa = makeMfaRepo({ mfaSecret: encryptSecret(secret) });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ state: authState(), user: safeUser() }), refreshRepo, mfa.repo, audit);

    await expect(svc.completeMfaSetup(USER_ID, '000000', CTX, true)).rejects.toMatchObject({ statusCode: 400 });
    expect(mfa.spies.enableMfa).not.toHaveBeenCalled();
  });
});

describe('AuthService.completeMfaChallenge', () => {
  const setup = (mfaState: Partial<MfaContext>) => {
    const mfa = makeMfaRepo({ isMfaEnabled: true, ...mfaState });
    const { audit, events } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ state: authState(), user: safeUser() }), refreshRepo, mfa.repo, audit);
    return { mfa, audit, events, svc };
  };

  it('accepts a valid TOTP code → session + MFA_LOGIN_SUCCESS', async () => {
    const secret = generateTotpSecret();
    const { svc, events } = setup({ mfaSecret: encryptSecret(secret) });
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    const result = await svc.completeMfaChallenge(token, authenticator.generate(secret), CTX);
    expect(result.kind).toBe('session');
    expect(events.map((e) => e.action)).toContain('MFA_LOGIN_SUCCESS');
  });

  it('accepts a single-use recovery code → session + MFA_RECOVERY_CODE_USED (consumed)', async () => {
    const secret = generateTotpSecret();
    const code = 'ABCDE-12345';
    const { svc, mfa, events } = setup({
      mfaSecret: encryptSecret(secret),
      recoveryCodeHashes: [hashRecoveryCode(code)],
    });
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    const result = await svc.completeMfaChallenge(token, code, CTX);
    expect(result.kind).toBe('session');
    expect(mfa.spies.consumeRecoveryCode).toHaveBeenCalledWith(USER_ID, hashRecoveryCode(code));
    expect(mfa.state.recoveryCodeHashes).toHaveLength(0); // consumed
    expect(events.map((e) => e.action)).toContain('MFA_RECOVERY_CODE_USED');
  });

  it('rejects an invalid code (401) + MFA_LOGIN_FAILED', async () => {
    const secret = generateTotpSecret();
    const { svc, events } = setup({ mfaSecret: encryptSecret(secret) });
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.completeMfaChallenge(token, '000000', CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(events.map((e) => e.action)).toContain('MFA_LOGIN_FAILED');
  });

  it('rejects a wrong-purpose token (enroll token cannot complete a challenge)', async () => {
    const secret = generateTotpSecret();
    const { svc } = setup({ mfaSecret: encryptSecret(secret) });
    const enrollToken = signMfaToken(USER_ID, 'mfa_enroll');

    await expect(
      svc.completeMfaChallenge(enrollToken, authenticator.generate(secret), CTX),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('AuthService.disableMfa', () => {
  it('disables with a correct password (step-up) + MFA_DISABLED', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const mfa = makeMfaRepo({ isMfaEnabled: true, mfaSecret: encryptSecret(generateTotpSecret()) }, passwordHash);
    const { audit, events } = makeAudit();
    const svc = new AuthService(makeAuthRepo({}), refreshRepo, mfa.repo, audit);

    await svc.disableMfa(USER_ID, { password: 'password123' }, CTX);
    expect(mfa.spies.disableMfa).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.action)).toContain('MFA_DISABLED');
  });

  it('disables with a correct TOTP code (step-up)', async () => {
    const secret = generateTotpSecret();
    const mfa = makeMfaRepo({ isMfaEnabled: true, mfaSecret: encryptSecret(secret) });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({}), refreshRepo, mfa.repo, audit);

    await svc.disableMfa(USER_ID, { code: authenticator.generate(secret) }, CTX);
    expect(mfa.spies.disableMfa).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong password/code (401) and does not disable', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const mfa = makeMfaRepo({ isMfaEnabled: true, mfaSecret: encryptSecret(generateTotpSecret()) }, passwordHash);
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({}), refreshRepo, mfa.repo, audit);

    await expect(svc.disableMfa(USER_ID, { password: 'wrong' }, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(mfa.spies.disableMfa).not.toHaveBeenCalled();
  });

  it('rejects disabling when MFA is not enabled (400)', async () => {
    const mfa = makeMfaRepo({ isMfaEnabled: false });
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({}), refreshRepo, mfa.repo, audit);
    await expect(svc.disableMfa(USER_ID, { password: 'x' }, CTX)).rejects.toMatchObject({ statusCode: 400 });
  });
});

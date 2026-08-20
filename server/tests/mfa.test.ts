import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from '../src/modules/auth/auth.service';
import type {
  IAuthRepository,
  UserRecord,
  AuthState,
  SafeUser,
} from '../src/modules/auth/auth.repository';
import type { IRefreshTokenRepository } from '../src/modules/auth/refreshToken.repository';
import type { IMfaRepository, EmailOtpState } from '../src/modules/auth/mfa.repository';
import type { AccountMailer } from '../src/shared/notifications/mailer';
import type { AuditEvent, IAuditLogger } from '../src/shared/audit/auditLogger';
import { signMfaToken } from '../src/shared/utils/mfaToken';
import { hashOtp, OTP_MAX_ATTEMPTS } from '../src/shared/utils/otp';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Email-OTP 2FA as a pure AuthService unit (no HTTP/prisma). Real OTP/token utils
// are used so the flow is authentic; repositories + mailer are in-memory fakes.
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

function makeMfaRepo(initial: Partial<EmailOtpState> = {}) {
  const s: EmailOtpState = {
    codeHash: initial.codeHash ?? null,
    codeExpiresAt: initial.codeExpiresAt ?? null,
    codeAttempts: initial.codeAttempts ?? 0,
  };
  const spies = {
    getEmailCode: vi.fn(async () => ({ ...s })),
    saveEmailCode: vi.fn(async (_id: number, hash: string, exp: Date) => {
      s.codeHash = hash;
      s.codeExpiresAt = exp;
      s.codeAttempts = 0;
    }),
    incrementAttempts: vi.fn(async () => {
      s.codeAttempts += 1;
      return s.codeAttempts;
    }),
    clearEmailCode: vi.fn(async () => {
      s.codeHash = null;
      s.codeExpiresAt = null;
      s.codeAttempts = 0;
    }),
  };
  return { repo: spies as IMfaRepository, spies, state: s };
}

function makeMailer() {
  const sent: Array<{ to: string; code: string }> = [];
  const mailer: AccountMailer = {
    sendInvitation: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    sendMfaCode: vi.fn(async (to: string, code: string) => {
      sent.push({ to, code });
    }),
  };
  return { mailer, sent };
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
    ...over,
  };
}

describe('AuthService.login — 2FA branching', () => {
  it('privileged → emails a code, stores its hash, returns an mfa challenge (no session)', async () => {
    const record = await userRecord({ role: Role.COMPANY_MANAGER });
    const mfa = makeMfaRepo();
    const { mailer, sent } = makeMailer();
    const { audit, events } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ record }), refreshRepo, mfa.repo, audit, mailer);

    const result = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    expect(result.kind).toBe('mfa');
    if (result.kind !== 'mfa') throw new Error('expected mfa');
    expect(typeof result.mfaToken).toBe('string');
    // A 6-digit code was emailed and its hash (not plaintext) persisted.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(mfa.state.codeHash).toBe(hashOtp(sent[0]!.code));
    expect(mfa.state.codeHash).not.toBe(sent[0]!.code);
    expect(events.map((e) => e.action)).toContain('MFA_CHALLENGE_ISSUED');
  });

  it('non-privileged → full session, no code emailed', async () => {
    const record = await userRecord({ role: Role.RENTER });
    const mfa = makeMfaRepo();
    const { mailer, sent } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(makeAuthRepo({ record }), refreshRepo, mfa.repo, audit, mailer);

    const result = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    expect(result.kind).toBe('session');
    expect(sent).toHaveLength(0);
    expect(mfa.spies.saveEmailCode).not.toHaveBeenCalled();
  });
});

describe('AuthService.completeMfaChallenge', () => {
  it('accepts the emailed code → session + MFA_LOGIN_SUCCESS, and consumes the code', async () => {
    const record = await userRecord();
    const mfa = makeMfaRepo();
    const { mailer, sent } = makeMailer();
    const { audit, events } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ record, state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );

    const login = await svc.login({ email: 'm@test.dev', password: 'password123' }, CTX);
    if (login.kind !== 'mfa') throw new Error('expected mfa');
    const code = sent[0]!.code;

    const result = await svc.completeMfaChallenge(login.mfaToken, code, CTX);
    expect(result.kind).toBe('session');
    expect(events.map((e) => e.action)).toContain('MFA_LOGIN_SUCCESS');
    expect(mfa.spies.clearEmailCode).toHaveBeenCalled();
    expect(mfa.state.codeHash).toBeNull(); // consumed
  });

  it('rejects a wrong code (401) + MFA_LOGIN_FAILED, and increments attempts', async () => {
    const mfa = makeMfaRepo({ codeHash: hashOtp('123456'), codeExpiresAt: new Date(Date.now() + 60_000) });
    const { mailer } = makeMailer();
    const { audit, events } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.completeMfaChallenge(token, '000000', CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(mfa.spies.incrementAttempts).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.action)).toContain('MFA_LOGIN_FAILED');
  });

  it('rejects an expired code (401) and clears it', async () => {
    const mfa = makeMfaRepo({ codeHash: hashOtp('123456'), codeExpiresAt: new Date(Date.now() - 1_000) });
    const { mailer } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.completeMfaChallenge(token, '123456', CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(mfa.spies.clearEmailCode).toHaveBeenCalled();
  });

  it('locks out after too many attempts — even a correct code is refused', async () => {
    const mfa = makeMfaRepo({
      codeHash: hashOtp('123456'),
      codeExpiresAt: new Date(Date.now() + 60_000),
      codeAttempts: OTP_MAX_ATTEMPTS,
    });
    const { mailer } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.completeMfaChallenge(token, '123456', CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(mfa.spies.clearEmailCode).toHaveBeenCalled();
  });

  it('rejects when there is no active code (401)', async () => {
    const mfa = makeMfaRepo(); // no code stored
    const { mailer } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.completeMfaChallenge(token, '123456', CTX)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token signed for the wrong audience/secret', async () => {
    const mfa = makeMfaRepo({ codeHash: hashOtp('123456'), codeExpiresAt: new Date(Date.now() + 60_000) });
    const { mailer } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );

    await expect(svc.completeMfaChallenge('not-a-valid-token', '123456', CTX)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('AuthService.resendMfaCode', () => {
  it('re-issues a fresh code + new token for an active privileged user', async () => {
    const mfa = makeMfaRepo({ codeHash: hashOtp('111111'), codeExpiresAt: new Date(Date.now() + 60_000) });
    const { mailer, sent } = makeMailer();
    const { audit, events } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState(), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    const result = await svc.resendMfaCode(token, CTX);
    expect(typeof result.mfaToken).toBe('string');
    expect(sent).toHaveLength(1);
    expect(mfa.state.codeHash).toBe(hashOtp(sent[0]!.code));
    expect(events.map((e) => e.action)).toContain('MFA_CHALLENGE_ISSUED');
  });

  it('rejects resend for an inactive user (401)', async () => {
    const mfa = makeMfaRepo();
    const { mailer, sent } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState({ isActive: false }), user: safeUser() }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.resendMfaCode(token, CTX)).rejects.toMatchObject({ statusCode: 401 });
    expect(sent).toHaveLength(0);
  });

  it('rejects resend for a non-privileged user (401)', async () => {
    const mfa = makeMfaRepo();
    const { mailer } = makeMailer();
    const { audit } = makeAudit();
    const svc = new AuthService(
      makeAuthRepo({ state: authState({ role: Role.RENTER }), user: safeUser({ role: Role.RENTER }) }),
      refreshRepo,
      mfa.repo,
      audit,
      mailer,
    );
    const token = signMfaToken(USER_ID, 'mfa_challenge');

    await expect(svc.resendMfaCode(token, CTX)).rejects.toMatchObject({ statusCode: 401 });
  });
});

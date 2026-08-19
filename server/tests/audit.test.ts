import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../src/shared/audit/audit.service';
import type { AuditLogRow, IAuditLogRepository } from '../src/shared/audit/audit.repository';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../src/shared/constants/auditActions';

/** A capturing fake repository — records the row the service builds. */
function fakeRepo(): { repo: IAuditLogRepository; rows: AuditLogRow[] } {
  const rows: AuditLogRow[] = [];
  return {
    rows,
    repo: {
      create: vi.fn(async (row: AuditLogRow) => {
        rows.push(row);
      }),
    },
  };
}

describe('AuditService.log — row construction', () => {
  it('flattens action, resource, actor, and context onto the row', async () => {
    const { repo, rows } = fakeRepo();
    const audit = new AuditService(repo);

    await audit.log({
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: '42',
      actor: { userId: 42, companyId: 7 },
      context: { ip: '203.0.113.9', userAgent: 'jest', requestId: 'req-1' },
      metadata: { result: 'success' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'AUTH',
      resourceId: '42',
      userId: 42,
      companyId: 7,
      ipAddress: '203.0.113.9',
      userAgent: 'jest',
      metadata: { result: 'success' },
    });
  });

  it('defaults absent actor/context/resource fields to null', async () => {
    const { repo, rows } = fakeRepo();
    const audit = new AuditService(repo);

    await audit.log({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      resourceType: RESOURCE_TYPES.AUTH,
      metadata: { reason: 'unknown_email', email: 'ghost@test.dev' },
    });

    expect(rows[0]).toMatchObject({
      userId: null,
      companyId: null,
      resourceId: null,
      ipAddress: null,
      userAgent: null,
    });
  });

  it('stores null metadata when none is provided', async () => {
    const { repo, rows } = fakeRepo();
    const audit = new AuditService(repo);
    await audit.log({
      action: AUDIT_ACTIONS.AUTH_TOKEN_REFRESH,
      resourceType: RESOURCE_TYPES.AUTH,
      actor: { userId: 1, companyId: 1 },
    });
    expect(rows[0]!.metadata).toBeNull();
  });
});

describe('AuditService.log — sanitization (§18)', () => {
  it('strips sensitive keys from metadata before persistence', async () => {
    const { repo, rows } = fakeRepo();
    const audit = new AuditService(repo);

    await audit.log({
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: '9',
      actor: { userId: 9 },
      metadata: {
        password: 'plaintext',
        token: 'raw-reset-token',
        tokenHash: 'deadbeef',
        cookie: 'token=abc',
        secret: 's',
        sessionsRevoked: true,
      },
    });

    const md = rows[0]!.metadata as Record<string, unknown>;
    expect(md['password']).toBe('[REDACTED]');
    expect(md['token']).toBe('[REDACTED]');
    expect(md['tokenHash']).toBe('[REDACTED]');
    expect(md['cookie']).toBe('[REDACTED]');
    expect(md['secret']).toBe('[REDACTED]');
    // Non-sensitive metadata survives.
    expect(md['sessionsRevoked']).toBe(true);
    // And nothing sensitive leaks in the serialized row.
    expect(JSON.stringify(rows[0])).not.toContain('raw-reset-token');
    expect(JSON.stringify(rows[0])).not.toContain('plaintext');
  });
});

describe('AuditService.log — resilience (§18)', () => {
  it('never throws when the repository write fails', async () => {
    const repo: IAuditLogRepository = {
      create: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const audit = new AuditService(repo);

    // Must resolve (not reject) — a logging failure cannot break the request flow.
    await expect(
      audit.log({
        action: AUDIT_ACTIONS.USER_CREATED,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: '5',
        actor: { userId: 1, companyId: 1 },
      }),
    ).resolves.toBeUndefined();
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

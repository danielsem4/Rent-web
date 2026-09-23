import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as payments.test.ts).
//
// `user.findUnique` backs `authenticate` (it re-derives role/companyId from the
// DB row). `inspection.findMany` backs the read-only company-wide module,
// driven by a mutable in-memory `inspections` array so the mock behaves like a
// tiny tenant-scoped store. The mock honors `where.companyId` and `select`
// (including the nested `property` join) so the list projection is faithfully
// exercised.
// ---------------------------------------------------------------------------
const { userFindUnique, findMany } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique: userFindUnique },
    inspection: { findMany },
    // Other routers instantiate repos over the same client at startup; stub the
    // surfaces they touch so app construction never hits a real DB.
    payment: { findMany: vi.fn() },
    property: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    worker: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// Imported AFTER the mock is registered (hoisting guarantees the order).
import { createApp } from '../src/app';

const app = createApp();

// ── Tenant layout ──────────────────────────────────────────────────────────
const COMPANY_A = 1;
const COMPANY_B = 2;
const PLATFORM = 9;

const MANAGER_ID = 1; // acting COMPANY_MANAGER, Company A
const WORKER_ID = 2; // COMPANY_WORKER, Company A
const RENTER_B_ID = 3; // RENTER, Company B
const SUPER_ID = 4; // SUPER_ADMIN, platform

const INSP_A_ID = 10; // inspection in Company A
const INSP_B_ID = 20; // inspection in Company B

let acting: UserRow[] = [];

interface InspectionRow {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: Date | null;
  nextInspectionDate: Date | null;
  property: { id: number; city: string; address: string };
}
let inspections: InspectionRow[] = [];

function makeInspection(overrides: Partial<InspectionRow>): InspectionRow {
  return {
    id: 1,
    companyId: COMPANY_A,
    propertyId: 100,
    lastInspectionDate: null,
    nextInspectionDate: new Date('2026-01-01T00:00:00.000Z'),
    property: { id: 100, city: 'Tel Aviv', address: '1 Herzl St' },
    ...overrides,
  };
}

userFindUnique.mockImplementation(async ({ where }: { where: { id?: number } }) => {
  return acting.find((u) => u.id === where.id) ?? null;
});

findMany.mockImplementation(
  async ({
    where,
    select,
  }: {
    where?: { companyId?: number };
    select?: Record<string, unknown>;
  }) => {
    const rows = inspections.filter(
      (i) => where?.companyId === undefined || i.companyId === where.companyId,
    );
    if (!select) return rows;
    return rows.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const [key, include] of Object.entries(select)) {
        if (include) projected[key] = (row as Record<string, unknown>)[key];
      }
      return projected;
    });
  },
);

const FORBIDDEN = 'Forbidden';
const AUTH_REQUIRED = 'Authentication required';
// Authenticated mutations must carry a matching Origin to pass the CSRF check,
// otherwise they 403 before routing (masking the "no such route" 404 we assert).
const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';

/** Cookie header for a signed session. Role in the token is snapshot-only;
 * authenticate re-derives it from the DB row. */
function cookieFor(userId: number): string[] {
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}
const managerCookie = () => cookieFor(MANAGER_ID);

beforeEach(async () => {
  acting = [
    await makeUserRow({ id: MANAGER_ID, email: 'manager-a@test.dev', name: 'Manager A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_ID, email: 'worker-a@test.dev', name: 'Worker A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'renter-b@test.dev', name: 'Renter B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 'super@test.dev', name: 'Super Admin', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
  inspections = [
    makeInspection({ id: INSP_A_ID, companyId: COMPANY_A, property: { id: 100, city: 'Tel Aviv', address: '1 Herzl St' } }),
    makeInspection({ id: INSP_B_ID, companyId: COMPANY_B, property: { id: 200, city: 'Eilat', address: '9 Beach Rd' } }),
  ];
});

// ===========================================================================
// Role authorization (deny-by-default; mirrors the properties READ policy)
// ===========================================================================
describe('Role authorization', () => {
  it('allows a COMPANY_MANAGER to read', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
  });

  it('allows a COMPANY_WORKER to read (read-only access)', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', cookieFor(WORKER_ID));
    expect(res.status).toBe(200);
  });

  it('forbids a RENTER entirely (403)', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', cookieFor(RENTER_B_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('forbids a SUPER_ADMIN on company-scoped routes (403, no bypass)', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', cookieFor(SUPER_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/inspections');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

// ===========================================================================
// No write verbs — this router is read-only (writes go via the property router)
// ===========================================================================
describe('GET /api/inspections — read-only surface', () => {
  it('does not expose POST / PATCH / DELETE (404)', async () => {
    expect((await request(app).post('/api/inspections').set('Cookie', managerCookie()).set('Origin', ORIGIN)).status).toBe(404);
    expect((await request(app).patch('/api/inspections/10').set('Cookie', managerCookie()).set('Origin', ORIGIN)).status).toBe(404);
    expect((await request(app).delete('/api/inspections/10').set('Cookie', managerCookie()).set('Origin', ORIGIN)).status).toBe(404);
  });
});

// ===========================================================================
// List isolation
// ===========================================================================
describe('GET /api/inspections — list isolation', () => {
  it('returns only inspections belonging to the caller’s company', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    const returned = res.body.inspections as Array<{ id: number; companyId: number }>;
    expect(returned.every((i) => i.companyId === COMPANY_A)).toBe(true);
    expect(returned.map((i) => i.id)).toEqual([INSP_A_ID]);
  });

  it('never returns another company’s inspection', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', managerCookie());
    const ids = (res.body.inspections as Array<{ id: number }>).map((i) => i.id);
    expect(ids).not.toContain(INSP_B_ID);
    expect(JSON.stringify(res.body)).not.toContain('Eilat');
  });

  it('includes the owning property summary on each row', async () => {
    const res = await request(app).get('/api/inspections').set('Cookie', managerCookie());
    expect(res.body.inspections[0].property).toMatchObject({
      city: 'Tel Aviv',
      address: '1 Herzl St',
    });
  });
});

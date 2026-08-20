import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';
import type { IAuditLogger, AuditEvent } from '../src/shared/audit/auditLogger';

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as users.test.ts).
//
// `user.findUnique` backs `authenticate` (it re-derives role/companyId/isActive/
// tokenVersion from the DB row). The `property.*` methods back the module, all
// driven by a single mutable in-memory `properties` array so the mock behaves
// like a tiny tenant-scoped store. `property.findMany` honors `select` so the
// list projection's omission of `entryCode` is faithfully exercised.
// ---------------------------------------------------------------------------
const { userFindUnique, findMany, findFirst, create, updateMany, deleteMany } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique: userFindUnique },
    property: { findMany, findFirst, create, updateMany, deleteMany },
    auditLog: { create: vi.fn() },
  },
}));

// Imported AFTER the mock is registered (hoisting guarantees the order).
import { createApp } from '../src/app';

// Capturing audit logger so tests can assert security events were emitted.
const auditEvents: AuditEvent[] = [];
const captureAudit: IAuditLogger = {
  log: async (event) => {
    auditEvents.push(event);
  },
};

const app = createApp(undefined, { auditLogger: captureAudit });

// ── Tenant layout ──────────────────────────────────────────────────────────
const COMPANY_A = 1;
const COMPANY_B = 2;
const PLATFORM = 9;

const MANAGER_ID = 1; // acting COMPANY_MANAGER, Company A
const WORKER_ID = 2; // COMPANY_WORKER, Company A
const RENTER_B_ID = 3; // RENTER, Company B
const SUPER_ID = 4; // SUPER_ADMIN, platform

const PROP_A_ID = 10; // property in Company A
const PROP_B_ID = 20; // property in Company B

let acting: UserRow[] = [];

interface PropRow {
  id: number;
  companyId: number;
  city: string;
  address: string;
  entryCode: string | null;
  electricMeter: string | null;
  waterMeter: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  monthlyRent: number;
  capacity: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
let properties: PropRow[] = [];
let nextId = 100;

function makeProp(overrides: Partial<PropRow>): PropRow {
  return {
    id: nextId++,
    companyId: COMPANY_A,
    city: 'Tel Aviv',
    address: '1 Herzl St',
    entryCode: '1234',
    electricMeter: null,
    waterMeter: null,
    ownerName: 'Owner One',
    ownerPhone: '050-0000000',
    contractStart: null,
    contractEnd: null,
    monthlyRent: 5000,
    capacity: 3,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
    select?: Record<string, boolean>;
  }) => {
    const rows = properties.filter(
      (p) => where?.companyId === undefined || p.companyId === where.companyId,
    );
    if (!select) return rows;
    // Honor `select` so the projection (which omits entryCode) is truly tested.
    return rows.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const [key, include] of Object.entries(select)) {
        if (include) projected[key] = (row as Record<string, unknown>)[key];
      }
      return projected;
    });
  },
);

findFirst.mockImplementation(async ({ where }: { where: { id?: number; companyId?: number } }) => {
  return (
    properties.find(
      (p) =>
        (where.id === undefined || p.id === where.id) &&
        (where.companyId === undefined || p.companyId === where.companyId),
    ) ?? null
  );
});

create.mockImplementation(async ({ data }: { data: Partial<PropRow> & { companyId: number } }) => {
  const row = makeProp({ ...data, id: nextId++ });
  properties.push(row);
  return row;
});

updateMany.mockImplementation(
  async ({ where, data }: { where: { id?: number; companyId?: number }; data: Partial<PropRow> }) => {
    const matches = properties.filter(
      (p) =>
        (where.id === undefined || p.id === where.id) &&
        (where.companyId === undefined || p.companyId === where.companyId),
    );
    for (const p of matches) Object.assign(p, data);
    return { count: matches.length };
  },
);

deleteMany.mockImplementation(async ({ where }: { where: { id?: number; companyId?: number } }) => {
  const before = properties.length;
  properties = properties.filter(
    (p) =>
      !(
        (where.id === undefined || p.id === where.id) &&
        (where.companyId === undefined || p.companyId === where.companyId)
      ),
  );
  return { count: before - properties.length };
});

const NOT_FOUND = 'Property not found';
const FORBIDDEN = 'Forbidden';
const AUTH_REQUIRED = 'Authentication required';
const ORIGIN = 'http://localhost:5173';

/** Cookie header for a signed session belonging to the given user id. Role in
 * the token is snapshot-only; authenticate re-derives it from the DB row. */
function cookieFor(userId: number): string[] {
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}
const managerCookie = () => cookieFor(MANAGER_ID);

const validCreateBody = (overrides: Record<string, unknown> = {}) => ({
  city: 'Haifa',
  address: '5 Ben Gurion Ave',
  entryCode: '9999',
  monthlyRent: 4200,
  capacity: 2,
  ...overrides,
});

beforeEach(async () => {
  nextId = 100;
  auditEvents.length = 0;
  acting = [
    await makeUserRow({ id: MANAGER_ID, email: 'manager-a@test.dev', name: 'Manager A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_ID, email: 'worker-a@test.dev', name: 'Worker A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'renter-b@test.dev', name: 'Renter B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 'super@test.dev', name: 'Super Admin', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
  properties = [
    makeProp({ id: PROP_A_ID, companyId: COMPANY_A, city: 'Tel Aviv', entryCode: 'A-SECRET' }),
    makeProp({ id: PROP_B_ID, companyId: COMPANY_B, city: 'Eilat', entryCode: 'B-SECRET' }),
  ];
});

// ===========================================================================
// Role authorization
// ===========================================================================
describe('Role authorization', () => {
  it('allows a COMPANY_MANAGER to read', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
  });

  it('allows a COMPANY_WORKER to read (read-only access)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', cookieFor(WORKER_ID));
    expect(res.status).toBe(200);
  });

  it('forbids a COMPANY_WORKER from creating (403)', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', cookieFor(WORKER_ID))
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('forbids a COMPANY_WORKER from deleting (403)', async () => {
    const res = await request(app)
      .delete(`/api/properties/${PROP_A_ID}`)
      .set('Cookie', cookieFor(WORKER_ID))
      .set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    // Row untouched.
    expect(properties.some((p) => p.id === PROP_A_ID)).toBe(true);
  });

  it('forbids a RENTER entirely (403)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', cookieFor(RENTER_B_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('forbids a SUPER_ADMIN on company-scoped routes (403, no bypass)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', cookieFor(SUPER_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

// ===========================================================================
// List isolation + data minimization
// ===========================================================================
describe('GET /api/properties — list isolation', () => {
  it('returns only properties belonging to the caller’s company', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    const returned = res.body.properties as Array<{ id: number; companyId: number }>;
    expect(returned.every((p) => p.companyId === COMPANY_A)).toBe(true);
    expect(returned.map((p) => p.id)).toEqual([PROP_A_ID]);
  });

  it('never returns another company’s property', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', managerCookie());
    const ids = (res.body.properties as Array<{ id: number }>).map((p) => p.id);
    expect(ids).not.toContain(PROP_B_ID);
  });

  it('omits entryCode from the list projection (data minimization)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', managerCookie());
    expect(JSON.stringify(res.body)).not.toContain('A-SECRET');
    expect(res.body.properties[0]).not.toHaveProperty('entryCode');
  });
});

// ===========================================================================
// Get isolation
// ===========================================================================
describe('GET /api/properties/:id — get isolation', () => {
  it('returns a same-company property with full detail (incl. entryCode)', async () => {
    const res = await request(app).get(`/api/properties/${PROP_A_ID}`).set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    expect(res.body.property.id).toBe(PROP_A_ID);
    expect(res.body.property.entryCode).toBe('A-SECRET');
  });

  it('returns 404 for a foreign-company property (does not reveal existence)', async () => {
    const res = await request(app).get(`/api/properties/${PROP_B_ID}`).set('Cookie', managerCookie());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_FOUND);
  });

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app).get('/api/properties/9999').set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const res = await request(app).get('/api/properties/abc').set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Create isolation
// ===========================================================================
describe('POST /api/properties — create isolation', () => {
  it('sets companyId to the authenticated manager’s company and audits it', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    expect(res.status).toBe(201);
    expect(res.body.property.companyId).toBe(COMPANY_A);
    expect(auditEvents.some((e) => e.action === 'PROPERTY_CREATED')).toBe(true);
  });

  it('ignores a client-supplied companyId (mass-assignment stripped)', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ companyId: COMPANY_B }));
    expect(res.status).toBe(201);
    expect(res.body.property.companyId).toBe(COMPANY_A);
  });

  it('rejects a body missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ city: 'Ashdod' }); // no address
    expect(res.status).toBe(400);
  });

  it('never writes entryCode value into the audit trail (field names only)', async () => {
    await request(app)
      .post('/api/properties')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ entryCode: 'SUPER-SECRET-CODE' }));
    const created = auditEvents.find((e) => e.action === 'PROPERTY_CREATED');
    expect(JSON.stringify(created?.metadata)).not.toContain('SUPER-SECRET-CODE');
    expect((created?.metadata as { fields?: string[] })?.fields).toContain('entryCode');
  });
});

// ===========================================================================
// Update isolation
// ===========================================================================
describe('PATCH /api/properties/:id — update isolation', () => {
  it('updates a same-company property', async () => {
    const res = await request(app)
      .patch(`/api/properties/${PROP_A_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ city: 'Ramat Gan' });
    expect(res.status).toBe(200);
    expect(res.body.property.city).toBe('Ramat Gan');
    expect(auditEvents.some((e) => e.action === 'PROPERTY_UPDATED')).toBe(true);
  });

  it('cannot update a foreign-company property (404)', async () => {
    const res = await request(app)
      .patch(`/api/properties/${PROP_B_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ city: 'Hacked' });
    expect(res.status).toBe(404);
    expect(properties.find((p) => p.id === PROP_B_ID)?.city).toBe('Eilat'); // untouched
  });

  it('cannot change companyId through PATCH (field stripped)', async () => {
    const res = await request(app)
      .patch(`/api/properties/${PROP_A_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ city: 'Still A', companyId: COMPANY_B });
    expect(res.status).toBe(200);
    expect(res.body.property.companyId).toBe(COMPANY_A);
  });
});

// ===========================================================================
// Delete isolation
// ===========================================================================
describe('DELETE /api/properties/:id — delete isolation', () => {
  it('deletes a same-company property (204) and audits it', async () => {
    const res = await request(app)
      .delete(`/api/properties/${PROP_A_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(properties.some((p) => p.id === PROP_A_ID)).toBe(false);
    expect(auditEvents.some((e) => e.action === 'PROPERTY_DELETED')).toBe(true);
  });

  it('cannot delete a foreign-company property (404, row survives)', async () => {
    const res = await request(app)
      .delete(`/api/properties/${PROP_B_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(properties.some((p) => p.id === PROP_B_ID)).toBe(true);
  });
});

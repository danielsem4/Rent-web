import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';
import type { IAuditLogger, AuditEvent } from '../src/shared/audit/auditLogger';

// The workers repository exercises the REAL AES-256-GCM cipher, so a key must be
// present. Set at call time (the util reads it lazily), before any request runs.
process.env['FIELD_ENCRYPTION_KEY'] = 'b'.repeat(64);

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as properties.test.ts). `worker.*` back the
// module against a mutable in-memory store; `property.findFirst` backs the
// apartment-assignment cross-tenant guard; `user.findUnique` backs authenticate.
// `worker.findMany` honors `select` so the list projection's omission of the
// encrypted identifier columns is faithfully exercised.
// ---------------------------------------------------------------------------
const {
  userFindUnique,
  findMany,
  findFirst,
  create,
  updateMany,
  deleteMany,
  propertyFindFirst,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  propertyFindFirst: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique: userFindUnique },
    worker: { findMany, findFirst, create, updateMany, deleteMany },
    property: { findFirst: propertyFindFirst },
    // Worker delete lists document storage keys to clean up files; no docs in
    // these tests, so return an empty set.
    workerDocument: { findMany: vi.fn(async () => []) },
    auditLog: { create: vi.fn() },
  },
}));

import { createApp } from '../src/app';

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

const MANAGER_ID = 1; // COMPANY_MANAGER, Company A
const WORKER_USER_ID = 2; // COMPANY_WORKER, Company A
const RENTER_B_ID = 3; // RENTER, Company B
const SUPER_ID = 4; // SUPER_ADMIN, platform

const WORKER_A_ID = 10; // worker record in Company A
const WORKER_B_ID = 20; // worker record in Company B
const PROP_A_ID = 100; // property in Company A
const PROP_B_ID = 200; // property in Company B

let acting: UserRow[] = [];

interface WorkerRow {
  id: number;
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate: Date | null;
  preferredLanguage: string | null;
  passportNumberEnc: string | null;
  passportExpiry: Date | null;
  visaType: string | null;
  visaExpiry: Date | null;
  insuranceProvider: string | null;
  insurancePolicyNumEnc: string | null;
  insuranceCoverageType: string | null;
  insuranceExpiry: Date | null;
  phone: string | null;
  employer: string | null;
  propertyId: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
let workers: WorkerRow[] = [];
let nextId = 300;

function makeWorker(overrides: Partial<WorkerRow>): WorkerRow {
  return {
    id: nextId++,
    companyId: COMPANY_A,
    nameHe: 'עובד',
    nameEn: 'Worker',
    nationality: 'Thailand',
    entryDate: null,
    preferredLanguage: null,
    passportNumberEnc: null,
    passportExpiry: null,
    visaType: null,
    visaExpiry: null,
    insuranceProvider: null,
    insurancePolicyNumEnc: null,
    insuranceCoverageType: null,
    insuranceExpiry: null,
    phone: null,
    employer: null,
    propertyId: null,
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
  async ({ where, select }: { where?: { companyId?: number }; select?: Record<string, boolean> }) => {
    const rows = workers.filter(
      (w) => where?.companyId === undefined || w.companyId === where.companyId,
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

findFirst.mockImplementation(async ({ where }: { where: { id?: number; companyId?: number } }) => {
  return (
    workers.find(
      (w) =>
        (where.id === undefined || w.id === where.id) &&
        (where.companyId === undefined || w.companyId === where.companyId),
    ) ?? null
  );
});

create.mockImplementation(async ({ data }: { data: Partial<WorkerRow> & { companyId: number } }) => {
  const row = makeWorker({ ...data, id: nextId++ });
  workers.push(row);
  return row;
});

updateMany.mockImplementation(
  async ({ where, data }: { where: { id?: number; companyId?: number }; data: Partial<WorkerRow> }) => {
    const matches = workers.filter(
      (w) =>
        (where.id === undefined || w.id === where.id) &&
        (where.companyId === undefined || w.companyId === where.companyId),
    );
    for (const w of matches) Object.assign(w, data);
    return { count: matches.length };
  },
);

deleteMany.mockImplementation(async ({ where }: { where: { id?: number; companyId?: number } }) => {
  const before = workers.length;
  workers = workers.filter(
    (w) =>
      !(
        (where.id === undefined || w.id === where.id) &&
        (where.companyId === undefined || w.companyId === where.companyId)
      ),
  );
  return { count: before - workers.length };
});

// Backs the apartment-assignment guard: PROP_A in Company A, PROP_B in Company B.
const propertyRows = [
  { id: PROP_A_ID, companyId: COMPANY_A },
  { id: PROP_B_ID, companyId: COMPANY_B },
];
propertyFindFirst.mockImplementation(
  async ({ where }: { where: { id?: number; companyId?: number } }) => {
    return (
      propertyRows.find(
        (p) =>
          (where.id === undefined || p.id === where.id) &&
          (where.companyId === undefined || p.companyId === where.companyId),
      ) ?? null
    );
  },
);

const NOT_FOUND = 'Worker not found';
const FORBIDDEN = 'Forbidden';
const AUTH_REQUIRED = 'Authentication required';
const ORIGIN = 'http://localhost:5173';

function cookieFor(userId: number): string[] {
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}
const managerCookie = () => cookieFor(MANAGER_ID);

const PASSPORT = 'PASSPORT-SECRET-123';
const POLICY = 'POLICY-SECRET-456';
const validCreateBody = (overrides: Record<string, unknown> = {}) => ({
  nameHe: 'סיריפורן',
  nameEn: 'Siriporn',
  nationality: 'Thailand',
  passportNumber: PASSPORT,
  insurancePolicyNumber: POLICY,
  ...overrides,
});

beforeEach(async () => {
  nextId = 300;
  auditEvents.length = 0;
  acting = [
    await makeUserRow({ id: MANAGER_ID, email: 'manager-a@test.dev', name: 'Manager A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_USER_ID, email: 'worker-a@test.dev', name: 'Worker A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'renter-b@test.dev', name: 'Renter B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 'super@test.dev', name: 'Super Admin', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
  workers = [
    makeWorker({ id: WORKER_A_ID, companyId: COMPANY_A, nameEn: 'Alpha' }),
    makeWorker({ id: WORKER_B_ID, companyId: COMPANY_B, nameEn: 'Bravo' }),
  ];
});

// ===========================================================================
// Role authorization
// ===========================================================================
describe('Role authorization', () => {
  it('allows a COMPANY_MANAGER to read', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
  });

  it('allows a COMPANY_WORKER to read (read-only)', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', cookieFor(WORKER_USER_ID));
    expect(res.status).toBe(200);
  });

  it('forbids a COMPANY_WORKER from creating (403)', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', cookieFor(WORKER_USER_ID))
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('forbids a RENTER entirely (403)', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', cookieFor(RENTER_B_ID));
    expect(res.status).toBe(403);
  });

  it('forbids a SUPER_ADMIN on company-scoped routes (403, no bypass)', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', cookieFor(SUPER_ID));
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

// ===========================================================================
// List isolation + data minimization (encrypted identifiers omitted)
// ===========================================================================
describe('GET /api/workers — list isolation + minimization', () => {
  it('returns only the caller company’s workers', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', managerCookie());
    const ids = (res.body.workers as Array<{ id: number }>).map((w) => w.id);
    expect(ids).toEqual([WORKER_A_ID]);
    expect(ids).not.toContain(WORKER_B_ID);
  });

  it('never includes passport / insurance numbers in the list', async () => {
    // Seed a worker with encrypted identifiers, then list.
    await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    const res = await request(app).get('/api/workers').set('Cookie', managerCookie());
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(PASSPORT);
    expect(body).not.toContain(POLICY);
    expect(res.body.workers[0]).not.toHaveProperty('passportNumber');
    expect(res.body.workers[0]).not.toHaveProperty('insurancePolicyNumber');
  });
});

// ===========================================================================
// Get isolation + encryption at rest / decryption on detail
// ===========================================================================
describe('GET /api/workers/:id — isolation + encryption round-trip', () => {
  it('returns 404 for a foreign-company worker (no existence leak)', async () => {
    const res = await request(app).get(`/api/workers/${WORKER_B_ID}`).set('Cookie', managerCookie());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_FOUND);
  });

  it('returns 404 for a malformed id', async () => {
    const res = await request(app).get('/api/workers/abc').set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('stores identifiers ENCRYPTED at rest and decrypts them on detail read', async () => {
    const created = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    const id = created.body.worker.id as number;

    // At rest: the persisted row holds ciphertext, not the plaintext.
    const row = workers.find((w) => w.id === id)!;
    expect(row.passportNumberEnc).toBeTruthy();
    expect(row.passportNumberEnc).not.toContain(PASSPORT);
    expect(row.insurancePolicyNumEnc).not.toContain(POLICY);

    // On detail read: decrypted back to plaintext for the authorized caller.
    const res = await request(app).get(`/api/workers/${id}`).set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    expect(res.body.worker.passportNumber).toBe(PASSPORT);
    expect(res.body.worker.insurancePolicyNumber).toBe(POLICY);
  });
});

// ===========================================================================
// Create isolation + mass assignment + audit + apartment guard
// ===========================================================================
describe('POST /api/workers — create isolation', () => {
  it('sets companyId from the session and audits WORKER_CREATED', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    expect(res.status).toBe(201);
    expect(res.body.worker.companyId).toBe(COMPANY_A);
    expect(auditEvents.some((e) => e.action === 'WORKER_CREATED')).toBe(true);
  });

  it('ignores a client-supplied companyId (mass-assignment stripped)', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ companyId: COMPANY_B }));
    expect(res.status).toBe(201);
    expect(res.body.worker.companyId).toBe(COMPANY_A);
  });

  it('rejects a body missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ nameHe: 'רק עברית' }); // missing nameEn + nationality
    expect(res.status).toBe(400);
  });

  it('never writes identifier VALUES into the audit trail (field names only)', async () => {
    await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    const created = auditEvents.find((e) => e.action === 'WORKER_CREATED');
    const meta = JSON.stringify(created?.metadata);
    expect(meta).not.toContain(PASSPORT);
    expect(meta).not.toContain(POLICY);
    expect((created?.metadata as { fields?: string[] })?.fields).toContain('passportNumber');
  });

  it('allows assigning a same-company property', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ propertyId: PROP_A_ID }));
    expect(res.status).toBe(201);
    expect(res.body.worker.propertyId).toBe(PROP_A_ID);
  });

  it('rejects assigning a foreign-company property (400, no cross-tenant link)', async () => {
    const before = workers.length;
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ propertyId: PROP_B_ID }));
    expect(res.status).toBe(400);
    expect(workers.length).toBe(before); // nothing persisted
  });
});

// ===========================================================================
// Update + delete isolation
// ===========================================================================
describe('PATCH/DELETE /api/workers/:id — isolation', () => {
  it('cannot update a foreign-company worker (404, untouched)', async () => {
    const res = await request(app)
      .patch(`/api/workers/${WORKER_B_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ nameEn: 'Hacked' });
    expect(res.status).toBe(404);
    expect(workers.find((w) => w.id === WORKER_B_ID)?.nameEn).toBe('Bravo');
  });

  it('cannot delete a foreign-company worker (404, row survives)', async () => {
    const res = await request(app)
      .delete(`/api/workers/${WORKER_B_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(workers.some((w) => w.id === WORKER_B_ID)).toBe(true);
  });

  it('deletes a same-company worker (204) and audits it', async () => {
    const res = await request(app)
      .delete(`/api/workers/${WORKER_A_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(workers.some((w) => w.id === WORKER_A_ID)).toBe(false);
    expect(auditEvents.some((e) => e.action === 'WORKER_DELETED')).toBe(true);
  });
});

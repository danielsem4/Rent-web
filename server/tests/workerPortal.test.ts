import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { signWorkerAccessToken } from '../src/shared/utils/workerAccessToken';

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as inspections.test.ts).
//
// The worker portal is Bearer-authenticated: `authenticateWorker` re-loads the
// Worker row via `worker.findUnique` (findAuthState) on EVERY request. The new
// GET /inspection read then calls `worker.findFirst` (resolve the worker's own
// propertyId) and `inspection.findFirst` (the property's inspection). All three
// are backed by mutable in-memory arrays so the mock behaves like a tiny
// tenant-scoped store and the `where`/`select` scoping is faithfully exercised.
// ---------------------------------------------------------------------------
const { workerFindUnique, workerFindFirst, inspectionFindFirst } = vi.hoisted(() => ({
  workerFindUnique: vi.fn(),
  workerFindFirst: vi.fn(),
  inspectionFindFirst: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    worker: { findUnique: workerFindUnique, findFirst: workerFindFirst, findMany: vi.fn() },
    inspection: { findFirst: inspectionFindFirst, findMany: vi.fn() },
    // Other routers instantiate repos over the same client at startup; stub the
    // surfaces they touch so app construction never hits a real DB.
    user: { findUnique: vi.fn() },
    payment: { findMany: vi.fn() },
    property: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    workerDocument: { findMany: vi.fn(), findFirst: vi.fn() },
    workerRequest: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// Imported AFTER the mock is registered (hoisting guarantees the order).
import { createApp } from '../src/app';

const app = createApp();

// ── Tenant layout ──────────────────────────────────────────────────────────
const COMPANY_A = 1;
const COMPANY_B = 2;

const WORKER_A_ID = 5; // worker in Company A, assigned to PROPERTY_A
const WORKER_NO_PROP_ID = 6; // worker in Company A, no assigned property
const PROPERTY_A = 100;
const PROPERTY_B = 200;

const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';
const AUTH_REQUIRED = 'Authentication required';

interface WorkerRow {
  id: number;
  companyId: number;
  propertyId: number | null;
  authEnabled: boolean;
  tokenVersion: number;
}
interface InspectionRow {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: Date | null;
  nextInspectionDate: Date | null;
  notes: string | null;
}

let workers: WorkerRow[] = [];
let inspections: InspectionRow[] = [];

/** Project a row through a Prisma-style `select` map. */
function project(row: Record<string, unknown>, select?: Record<string, unknown>) {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const [key, include] of Object.entries(select)) {
    if (include) out[key] = row[key];
  }
  return out;
}

// findAuthState → worker.findUnique({ where: { id }, select })
workerFindUnique.mockImplementation(
  async ({ where, select }: { where: { id: number }; select?: Record<string, unknown> }) => {
    const row = workers.find((w) => w.id === where.id);
    return row ? project(row as unknown as Record<string, unknown>, select) : null;
  },
);

// getInspection step 1 → worker.findFirst({ where: { id, companyId }, select })
workerFindFirst.mockImplementation(
  async ({
    where,
    select,
  }: {
    where: { id: number; companyId: number };
    select?: Record<string, unknown>;
  }) => {
    const row = workers.find((w) => w.id === where.id && w.companyId === where.companyId);
    return row ? project(row as unknown as Record<string, unknown>, select) : null;
  },
);

// getInspection step 2 → inspection.findFirst({ where: { propertyId, companyId }, select })
inspectionFindFirst.mockImplementation(
  async ({
    where,
    select,
  }: {
    where: { propertyId: number; companyId: number };
    select?: Record<string, unknown>;
  }) => {
    const row = inspections.find(
      (i) => i.propertyId === where.propertyId && i.companyId === where.companyId,
    );
    return row ? project(row as unknown as Record<string, unknown>, select) : null;
  },
);

/** A valid Bearer header for an app-enabled worker (tokenVersion 0). */
function bearer(workerId: number, companyId: number): string {
  return `Bearer ${signWorkerAccessToken(workerId, companyId, 0)}`;
}

beforeEach(() => {
  workers = [
    { id: WORKER_A_ID, companyId: COMPANY_A, propertyId: PROPERTY_A, authEnabled: true, tokenVersion: 0 },
    { id: WORKER_NO_PROP_ID, companyId: COMPANY_A, propertyId: null, authEnabled: true, tokenVersion: 0 },
  ];
  inspections = [
    {
      id: 10,
      companyId: COMPANY_A,
      propertyId: PROPERTY_A,
      lastInspectionDate: new Date('2026-01-01T00:00:00.000Z'),
      nextInspectionDate: new Date('2026-07-01T00:00:00.000Z'),
      notes: 'All good',
    },
    // A DIFFERENT tenant's inspection for a different property — must never leak.
    {
      id: 20,
      companyId: COMPANY_B,
      propertyId: PROPERTY_B,
      lastInspectionDate: null,
      nextInspectionDate: new Date('2026-09-01T00:00:00.000Z'),
      notes: 'Company B only',
    },
  ];
});

// ===========================================================================
// GET /api/worker-portal/inspection — happy path
// ===========================================================================
describe('GET /api/worker-portal/inspection', () => {
  it("returns the worker's assigned property inspection (200)", async () => {
    const res = await request(app)
      .get('/api/worker-portal/inspection')
      .set('Authorization', bearer(WORKER_A_ID, COMPANY_A));
    expect(res.status).toBe(200);
    expect(res.body.inspection).toEqual({
      lastInspectionDate: '2026-01-01T00:00:00.000Z',
      nextInspectionDate: '2026-07-01T00:00:00.000Z',
      notes: 'All good',
    });
  });

  it('returns { inspection: null } for a worker with no assigned property', async () => {
    const res = await request(app)
      .get('/api/worker-portal/inspection')
      .set('Authorization', bearer(WORKER_NO_PROP_ID, COMPANY_A));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inspection: null });
  });
});

// ===========================================================================
// Authentication + tenant isolation (deny-by-default)
// ===========================================================================
describe('GET /api/worker-portal/inspection — auth & isolation', () => {
  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/worker-portal/inspection');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });

  it('never returns another tenant’s inspection (scoped by companyId)', async () => {
    // Move worker A's assignment to PROPERTY_B, whose only inspection belongs to
    // Company B. The companyId scope (Company A) must yield no match → null.
    workers[0].propertyId = PROPERTY_B;
    const res = await request(app)
      .get('/api/worker-portal/inspection')
      .set('Authorization', bearer(WORKER_A_ID, COMPANY_A));
    expect(res.status).toBe(200);
    expect(res.body.inspection).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Company B only');
  });
});

// ===========================================================================
// Read-only surface — no write verbs
// ===========================================================================
describe('GET /api/worker-portal/inspection — read-only surface', () => {
  it('does not expose POST / PATCH / DELETE (404)', async () => {
    const auth = bearer(WORKER_A_ID, COMPANY_A);
    expect(
      (await request(app).post('/api/worker-portal/inspection').set('Authorization', auth).set('Origin', ORIGIN)).status,
    ).toBe(404);
    expect(
      (await request(app).patch('/api/worker-portal/inspection').set('Authorization', auth).set('Origin', ORIGIN)).status,
    ).toBe(404);
    expect(
      (await request(app).delete('/api/worker-portal/inspection').set('Authorization', auth).set('Origin', ORIGIN)).status,
    ).toBe(404);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';
import type { IAuditLogger, AuditEvent } from '../src/shared/audit/auditLogger';
import type { IFileStorage } from '../src/shared/storage/fileStorage';

// ---------------------------------------------------------------------------
// Prisma isolation. `worker.findFirst` backs the parent-worker tenant check;
// `workerDocument.*` back the documents store; `user.findUnique` backs auth.
// A single in-memory `docs` array behaves like a tiny tenant-scoped store.
// ---------------------------------------------------------------------------
const { userFindUnique, workerFindFirst, docFindMany, docFindFirst, docCreate, docDeleteMany } =
  vi.hoisted(() => ({
    userFindUnique: vi.fn(),
    workerFindFirst: vi.fn(),
    docFindMany: vi.fn(),
    docFindFirst: vi.fn(),
    docCreate: vi.fn(),
    docDeleteMany: vi.fn(),
  }));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique: userFindUnique },
    worker: { findFirst: workerFindFirst },
    workerDocument: {
      findMany: docFindMany,
      findFirst: docFindFirst,
      create: docCreate,
      deleteMany: docDeleteMany,
    },
    auditLog: { create: vi.fn() },
  },
}));

import { createApp } from '../src/app';

// In-memory storage stub injected into the app (no disk, no encryption needed).
const store = new Map<string, Buffer>();
const memoryStorage: IFileStorage = {
  async save(key, data) {
    store.set(key, Buffer.from(data));
  },
  async read(key) {
    const v = store.get(key);
    if (!v) throw new Error('missing');
    return v;
  },
  async delete(key) {
    store.delete(key);
  },
};

const auditEvents: AuditEvent[] = [];
const captureAudit: IAuditLogger = {
  log: async (e) => {
    auditEvents.push(e);
  },
};

const app = createApp(undefined, { auditLogger: captureAudit, storage: memoryStorage });

// ── Tenant layout ──
const COMPANY_A = 1;
const COMPANY_B = 2;
const PLATFORM = 9;
const MANAGER_ID = 1; // COMPANY_MANAGER, Company A
const WORKER_USER_ID = 2; // COMPANY_WORKER, Company A
const RENTER_B_ID = 3; // RENTER, Company B
const SUPER_ID = 4; // SUPER_ADMIN
const WORKER_A = 10; // worker record in Company A
const WORKER_B = 20; // worker record in Company B

let acting: UserRow[] = [];

interface DocRow {
  id: number;
  companyId: number;
  workerId: number;
  docType: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: Date;
}
let docs: DocRow[] = [];
let nextId = 100;

// A valid 1x1 PNG (real magic bytes) and a valid minimal PDF.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' + '01f15c4890000000a49444154789c6360000002000154a24f9f0000000049454e44ae426082',
  'hex',
);
const PDF = Buffer.from('255044462d312e340a25e2e3cfd30a', 'hex'); // %PDF-1.4 + binary marker

userFindUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
  acting.find((u) => u.id === where.id) ?? null,
);

// Parent worker exists only within its own company.
const workerRows = [
  { id: WORKER_A, companyId: COMPANY_A },
  { id: WORKER_B, companyId: COMPANY_B },
];
workerFindFirst.mockImplementation(
  async ({ where }: { where: { id?: number; companyId?: number } }) => {
    const w = workerRows.find(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        (where.companyId === undefined || r.companyId === where.companyId),
    );
    // WorkersRepository.findByIdInCompany expects a full row shape; enc fields null.
    return w
      ? { id: w.id, companyId: w.companyId, passportNumberEnc: null, insurancePolicyNumEnc: null }
      : null;
  },
);

docFindMany.mockImplementation(
  async ({
    where,
    select,
  }: {
    where: { workerId?: number; companyId?: number };
    select?: Record<string, boolean>;
  }) => {
    const rows = docs.filter(
      (d) =>
        (where.workerId === undefined || d.workerId === where.workerId) &&
        (where.companyId === undefined || d.companyId === where.companyId),
    );
    if (!select) return rows;
    return rows.map((row) => {
      const p: Record<string, unknown> = {};
      for (const [k, inc] of Object.entries(select)) if (inc) p[k] = (row as Record<string, unknown>)[k];
      return p;
    });
  },
);

docFindFirst.mockImplementation(
  async ({ where }: { where: { id?: number; workerId?: number; companyId?: number } }) =>
    docs.find(
      (d) =>
        (where.id === undefined || d.id === where.id) &&
        (where.workerId === undefined || d.workerId === where.workerId) &&
        (where.companyId === undefined || d.companyId === where.companyId),
    ) ?? null,
);

docCreate.mockImplementation(async ({ data }: { data: Omit<DocRow, 'id' | 'createdAt'> }) => {
  const row: DocRow = { ...data, id: nextId++, createdAt: new Date('2026-01-01T00:00:00.000Z') };
  docs.push(row);
  return row;
});

docDeleteMany.mockImplementation(
  async ({ where }: { where: { id?: number; workerId?: number; companyId?: number } }) => {
    const before = docs.length;
    docs = docs.filter(
      (d) =>
        !(
          (where.id === undefined || d.id === where.id) &&
          (where.workerId === undefined || d.workerId === where.workerId) &&
          (where.companyId === undefined || d.companyId === where.companyId)
        ),
    );
    return { count: before - docs.length };
  },
);

const ORIGIN = 'http://localhost:5173';
function cookieFor(userId: number): string[] {
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}
const managerCookie = () => cookieFor(MANAGER_ID);

function seedDoc(over: Partial<DocRow> = {}): DocRow {
  const row: DocRow = {
    id: nextId++,
    companyId: COMPANY_A,
    workerId: WORKER_A,
    docType: 'PASSPORT',
    originalName: 'passport.png',
    storageKey: `key-${nextId}`,
    mimeType: 'image/png',
    size: PNG.length,
    checksum: 'abc',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
  docs.push(row);
  store.set(row.storageKey, PNG);
  return row;
}

beforeEach(async () => {
  nextId = 100;
  auditEvents.length = 0;
  docs = [];
  store.clear();
  acting = [
    await makeUserRow({ id: MANAGER_ID, email: 'm-a@test.dev', name: 'M A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_USER_ID, email: 'w-a@test.dev', name: 'W A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'r-b@test.dev', name: 'R B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 's@test.dev', name: 'S', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
});

const base = `/api/workers/${WORKER_A}/documents`;

describe('Role authorization', () => {
  it('allows a COMPANY_WORKER to list (read)', async () => {
    const res = await request(app).get(base).set('Cookie', cookieFor(WORKER_USER_ID));
    expect(res.status).toBe(200);
  });

  it('forbids a COMPANY_WORKER from uploading (403)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', cookieFor(WORKER_USER_ID))
      .set('Origin', ORIGIN)
      .field('docType', 'PASSPORT')
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('forbids a RENTER entirely (403)', async () => {
    const res = await request(app).get(base).set('Cookie', cookieFor(RENTER_B_ID));
    expect(res.status).toBe(403);
  });

  it('forbids a SUPER_ADMIN (403)', async () => {
    const res = await request(app).get(base).set('Cookie', cookieFor(SUPER_ID));
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get(base);
    expect(res.status).toBe(401);
  });
});

describe('POST upload', () => {
  it('accepts a valid PNG, stores it, and audits (names only)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .field('docType', 'PASSPORT')
      .attach('file', PNG, { filename: 'my-passport.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.document.docType).toBe('PASSPORT');
    expect(res.body.document).not.toHaveProperty('storageKey');
    expect(store.size).toBe(1);
    const ev = auditEvents.find((e) => e.action === 'WORKER_DOCUMENT_UPLOADED');
    expect(ev).toBeTruthy();
    // Metadata must not carry the original filename.
    expect(JSON.stringify(ev?.metadata)).not.toContain('my-passport');
  });

  it('accepts a valid PDF', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .field('docType', 'VISA')
      .attach('file', PDF, { filename: 'visa.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
  });

  it('rejects a file whose bytes are not a real allowed type (magic-byte check, 400)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .field('docType', 'OTHER')
      // Declared png but the bytes are plain text → magic-byte sniff rejects.
      .attach('file', Buffer.from('not really an image'), { filename: 'fake.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
  });

  it('rejects an invalid docType (400)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .field('docType', 'NOPE')
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('Tenant isolation', () => {
  const foreignBase = `/api/workers/${WORKER_B}/documents`;

  it('uploading to another company’s worker → 404 (no leak)', async () => {
    const res = await request(app)
      .post(foreignBase)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .field('docType', 'PASSPORT')
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it('listing another company’s worker docs → 404', async () => {
    const res = await request(app).get(foreignBase).set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('downloading a doc belonging to another company → 404', async () => {
    const foreign = seedDoc({ id: 500, companyId: COMPANY_B, workerId: WORKER_B, storageKey: 'k-b' });
    const res = await request(app)
      .get(`/api/workers/${WORKER_B}/documents/${foreign.id}/download`)
      .set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('list never exposes the storageKey', async () => {
    seedDoc();
    const res = await request(app).get(base).set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });
});

describe('GET download / DELETE', () => {
  it('downloads own document as an attachment with the bytes', async () => {
    const doc = seedDoc();
    const res = await request(app)
      .get(`${base}/${doc.id}/download`)
      .set('Cookie', managerCookie())
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(c));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(Buffer.isBuffer(res.body) ? res.body.equals(PNG) : false).toBe(true);
  });

  it('deletes own document (204), removing both row and file', async () => {
    const doc = seedDoc();
    expect(store.size).toBe(1);
    const res = await request(app)
      .delete(`${base}/${doc.id}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(docs.some((d) => d.id === doc.id)).toBe(false);
    expect(store.size).toBe(0);
  });
});

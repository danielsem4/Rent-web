import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';
import type { IAuditLogger, AuditEvent } from '../src/shared/audit/auditLogger';
import type { IFileStorage } from '../src/shared/storage/fileStorage';

// ---------------------------------------------------------------------------
// Prisma isolation. `property.findFirst` backs the parent-property tenant check;
// `propertyImage.*` back the image store; `user.findUnique` backs auth. A single
// in-memory `images` array behaves like a tiny tenant-scoped store.
// ---------------------------------------------------------------------------
const {
  userFindUnique,
  propertyFindFirst,
  imgFindMany,
  imgFindFirst,
  imgCreate,
  imgDeleteMany,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  propertyFindFirst: vi.fn(),
  imgFindMany: vi.fn(),
  imgFindFirst: vi.fn(),
  imgCreate: vi.fn(),
  imgDeleteMany: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique: userFindUnique },
    property: { findFirst: propertyFindFirst },
    propertyImage: {
      findMany: imgFindMany,
      findFirst: imgFindFirst,
      create: imgCreate,
      deleteMany: imgDeleteMany,
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
const PROP_A = 10; // property in Company A
const PROP_B = 20; // property in Company B

let acting: UserRow[] = [];

interface ImgRow {
  id: number;
  companyId: number;
  propertyId: number;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: Date;
}
let images: ImgRow[] = [];
let nextId = 100;

// Real magic bytes for each accepted image kind.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
    '01f15c4890000000a49444154789c6360000002000154a24f9f0000000049454e44ae426082',
  'hex',
);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex'); // FF D8 FF … JFIF
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'latin1'),
  Buffer.from('VP8 ', 'latin1'),
]);
const PDF = Buffer.from('255044462d312e340a25e2e3cfd30a', 'hex'); // a real PDF — but not an allowed image

userFindUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
  acting.find((u) => u.id === where.id) ?? null,
);

// Parent property exists only within its own company.
const propertyRows = [
  { id: PROP_A, companyId: COMPANY_A },
  { id: PROP_B, companyId: COMPANY_B },
];
propertyFindFirst.mockImplementation(
  async ({ where }: { where: { id?: number; companyId?: number } }) =>
    propertyRows.find(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        (where.companyId === undefined || r.companyId === where.companyId),
    ) ?? null,
);

imgFindMany.mockImplementation(
  async ({
    where,
    select,
  }: {
    where: { propertyId?: number; companyId?: number };
    select?: Record<string, boolean>;
  }) => {
    const rows = images.filter(
      (d) =>
        (where.propertyId === undefined || d.propertyId === where.propertyId) &&
        (where.companyId === undefined || d.companyId === where.companyId),
    );
    if (!select) return rows;
    return rows.map((row) => {
      const p: Record<string, unknown> = {};
      for (const [k, inc] of Object.entries(select))
        if (inc) p[k] = (row as Record<string, unknown>)[k];
      return p;
    });
  },
);

imgFindFirst.mockImplementation(
  async ({ where }: { where: { id?: number; propertyId?: number; companyId?: number } }) =>
    images.find(
      (d) =>
        (where.id === undefined || d.id === where.id) &&
        (where.propertyId === undefined || d.propertyId === where.propertyId) &&
        (where.companyId === undefined || d.companyId === where.companyId),
    ) ?? null,
);

imgCreate.mockImplementation(async ({ data }: { data: Omit<ImgRow, 'id' | 'createdAt'> }) => {
  const row: ImgRow = { ...data, id: nextId++, createdAt: new Date('2026-01-01T00:00:00.000Z') };
  images.push(row);
  return row;
});

imgDeleteMany.mockImplementation(
  async ({ where }: { where: { id?: number; propertyId?: number; companyId?: number } }) => {
    const before = images.length;
    images = images.filter(
      (d) =>
        !(
          (where.id === undefined || d.id === where.id) &&
          (where.propertyId === undefined || d.propertyId === where.propertyId) &&
          (where.companyId === undefined || d.companyId === where.companyId)
        ),
    );
    return { count: before - images.length };
  },
);

const ORIGIN = 'http://localhost:5173';
function cookieFor(userId: number): string[] {
  // Token claims are non-authoritative — authenticate re-derives role/company
  // from the DB row (acting). The placeholder values here are ignored.
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}
const managerCookie = () => cookieFor(MANAGER_ID);

function seedImage(over: Partial<ImgRow> = {}): ImgRow {
  const row: ImgRow = {
    id: nextId++,
    companyId: COMPANY_A,
    propertyId: PROP_A,
    originalName: 'photo.png',
    storageKey: `key-${nextId}`,
    mimeType: 'image/png',
    size: PNG.length,
    checksum: 'abc',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
  images.push(row);
  store.set(row.storageKey, PNG);
  return row;
}

beforeEach(async () => {
  nextId = 100;
  auditEvents.length = 0;
  images = [];
  store.clear();
  acting = [
    await makeUserRow({ id: MANAGER_ID, email: 'm-a@test.dev', name: 'M A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_USER_ID, email: 'w-a@test.dev', name: 'W A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'r-b@test.dev', name: 'R B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 's@test.dev', name: 'S', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
});

const base = `/api/properties/${PROP_A}/images`;

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
  it('accepts a valid PNG, stores it, and audits (no filename in metadata)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .attach('file', PNG, { filename: 'living-room.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.image.mimeType).toBe('image/png');
    expect(res.body.image).not.toHaveProperty('storageKey');
    expect(store.size).toBe(1);
    const ev = auditEvents.find((e) => e.action === 'PROPERTY_IMAGE_UPLOADED');
    expect(ev).toBeTruthy();
    // Metadata must not carry the original filename or bytes.
    expect(JSON.stringify(ev?.metadata)).not.toContain('living-room');
  });

  it('accepts a valid JPEG', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .attach('file', JPEG, { filename: 'kitchen.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.image.mimeType).toBe('image/jpeg');
  });

  it('accepts a valid WebP', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .attach('file', WEBP, { filename: 'yard.webp', contentType: 'image/webp' });
    expect(res.status).toBe(201);
    expect(res.body.image.mimeType).toBe('image/webp');
  });

  it('rejects a file whose bytes are not a real image (magic-byte check, 400)', async () => {
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      // Declared png but the bytes are plain text → magic-byte sniff rejects.
      .attach('file', Buffer.from('not really an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
  });

  it('rejects a PDF (not an allowed image type)', async () => {
    // multer's fileFilter drops the non-image content type, so no file reaches
    // the service → "A file is required" (400). PDFs are never accepted here.
    const res = await request(app)
      .post(base)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .attach('file', PDF, { filename: 'brochure.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
  });
});

describe('Tenant isolation', () => {
  const foreignBase = `/api/properties/${PROP_B}/images`;

  it('uploading to another company’s property → 404 (no leak)', async () => {
    const res = await request(app)
      .post(foreignBase)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it('listing another company’s property images → 404', async () => {
    const res = await request(app).get(foreignBase).set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('downloading an image belonging to another company → 404', async () => {
    const foreign = seedImage({ id: 500, companyId: COMPANY_B, propertyId: PROP_B, storageKey: 'k-b' });
    const res = await request(app)
      .get(`/api/properties/${PROP_B}/images/${foreign.id}/download`)
      .set('Cookie', managerCookie());
    expect(res.status).toBe(404);
  });

  it('deleting an image belonging to another company → 404 (untouched)', async () => {
    const foreign = seedImage({ id: 501, companyId: COMPANY_B, propertyId: PROP_B, storageKey: 'k-b2' });
    const res = await request(app)
      .delete(`/api/properties/${PROP_B}/images/${foreign.id}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(images.some((d) => d.id === foreign.id)).toBe(true);
  });

  it('list never exposes the storageKey', async () => {
    seedImage();
    const res = await request(app).get(base).set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });
});

describe('GET download / DELETE', () => {
  it('downloads own image as an attachment with the bytes', async () => {
    const img = seedImage();
    const res = await request(app)
      .get(`${base}/${img.id}/download`)
      .set('Cookie', managerCookie())
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(c));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    // Hardening kept: served as attachment + nosniff, never inline.
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.isBuffer(res.body) ? res.body.equals(PNG) : false).toBe(true);
  });

  it('deletes own image (204), removing both row and file', async () => {
    const img = seedImage();
    expect(store.size).toBe(1);
    const res = await request(app)
      .delete(`${base}/${img.id}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(images.some((d) => d.id === img.id)).toBe(false);
    expect(store.size).toBe(0);
  });
});

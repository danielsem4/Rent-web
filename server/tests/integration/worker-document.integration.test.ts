import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';
import { LocalFileStorage } from '../../src/shared/storage/localFileStorage';

// Real-DB + real-disk proof of worker-document handling: encryption at rest,
// authorized download round-trip, tenant isolation, and delete cleanup. Uses a
// real LocalFileStorage pointed at a throwaway temp directory.

const tmpDir = path.join(os.tmpdir(), 'rentplus-doc-test-' + process.pid);
const storage = new LocalFileStorage(tmpDir);
const app = createTestApp(undefined, { storage });

let t: SeededTenants;
let managerA: string[];
let workerAId: number;
let workerBId: number;
const ORIGIN = 'http://localhost:5173';

// Real magic-byte payloads.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' + '01f15c4890000000a49444154789c6360000002000154a24f9f0000000049454e44ae426082',
  'hex',
);

beforeEach(async () => {
  await resetDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;

  const wa = await prisma.worker.create({
    data: { companyId: t.companyA, nameHe: 'עובד', nameEn: 'Alpha', nationality: 'Thailand' },
  });
  const wb = await prisma.worker.create({
    data: { companyId: t.companyB, nameHe: 'עובד', nameEn: 'Bravo', nationality: 'India' },
  });
  workerAId = wa.id;
  workerBId = wb.id;
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function upload(workerId: number, cookie: string[]) {
  return request(app)
    .post(`/api/workers/${workerId}/documents`)
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .field('docType', 'PASSPORT')
    .attach('file', PNG, { filename: 'passport.png', contentType: 'image/png' });
}

describe('Integration · worker document encryption + lifecycle', () => {
  it('stores the file ENCRYPTED at rest (ciphertext on disk, no PNG signature)', async () => {
    const res = await upload(workerAId, managerA);
    expect(res.status).toBe(201);

    const row = await prisma.workerDocument.findFirst({ where: { workerId: workerAId } });
    expect(row).not.toBeNull();
    const onDisk = await fs.readFile(path.join(tmpDir, row!.storageKey));
    // The raw file must be ciphertext — not the original PNG bytes.
    expect(onDisk.equals(PNG)).toBe(false);
    expect(onDisk.subarray(0, 8).equals(PNG.subarray(0, 8))).toBe(false); // no PNG magic
  });

  it('downloads the ORIGINAL bytes for an authorized caller (decrypt round-trip)', async () => {
    const created = await upload(workerAId, managerA);
    const id = created.body.document.id as number;
    const res = await request(app)
      .get(`/api/workers/${workerAId}/documents/${id}/download`)
      .set('Cookie', managerA)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect((res.body as Buffer).equals(PNG)).toBe(true);
  });

  it('records the upload in the real AuditLog without the original filename', async () => {
    await upload(workerAId, managerA);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'WORKER_DOCUMENT_UPLOADED' } });
    expect(audit).not.toBeNull();
    expect(audit?.companyId).toBe(t.companyA);
    expect(JSON.stringify(audit?.metadata)).not.toContain('passport.png');
  });

  it('a Company A manager cannot download a Company B worker’s document (404)', async () => {
    // Seed a doc for company B directly (bytes through the same storage).
    const key = 'b-key-1';
    await storage.save(key, PNG);
    const doc = await prisma.workerDocument.create({
      data: {
        companyId: t.companyB, workerId: workerBId, docType: 'PASSPORT',
        originalName: 'b.png', storageKey: key, mimeType: 'image/png', size: PNG.length, checksum: 'x',
      },
    });
    const res = await request(app)
      .get(`/api/workers/${workerBId}/documents/${doc.id}/download`)
      .set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('delete removes both the DB row and the file on disk', async () => {
    const created = await upload(workerAId, managerA);
    const id = created.body.document.id as number;
    const row = await prisma.workerDocument.findUnique({ where: { id } });
    const filePath = path.join(tmpDir, row!.storageKey);
    await expect(fs.access(filePath)).resolves.toBeUndefined(); // exists

    const res = await request(app)
      .delete(`/api/workers/${workerAId}/documents/${id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(await prisma.workerDocument.findUnique({ where: { id } })).toBeNull();
    await expect(fs.access(filePath)).rejects.toBeTruthy(); // gone
  });

  it('deleting the worker also removes its document files from disk', async () => {
    const created = await upload(workerAId, managerA);
    const row = await prisma.workerDocument.findUnique({ where: { id: created.body.document.id } });
    const filePath = path.join(tmpDir, row!.storageKey);

    const res = await request(app)
      .delete(`/api/workers/${workerAId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    // Cascade removed the row; the cleanup removed the file.
    expect(await prisma.workerDocument.count({ where: { workerId: workerAId } })).toBe(0);
    await expect(fs.access(filePath)).rejects.toBeTruthy();
  });
});

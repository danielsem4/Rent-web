import prisma from '../../../lib/prisma';

/**
 * Worker-document METADATA store (SECURITY_PRINCIPLES.md §16). The bytes live in
 * the file-storage backend, never here — this table holds only the row that
 * describes a stored object. Tenant-isolated by `companyId`, mirroring
 * `workers.repository.ts`.
 */

export type WorkerDocumentType = 'PASSPORT' | 'VISA' | 'INSURANCE' | 'OTHER';

/** Metadata returned to clients (never includes bytes or the storage key). */
export interface WorkerDocumentItem {
  id: number;
  workerId: number;
  docType: WorkerDocumentType;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Full record incl. the internal `storageKey` — used server-side only (download/delete). */
export interface WorkerDocumentRecord extends WorkerDocumentItem {
  companyId: number;
  storageKey: string;
  checksum: string;
}

export interface CreateWorkerDocumentData {
  companyId: number;
  workerId: number;
  docType: WorkerDocumentType;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
}

export interface IWorkerDocumentsRepository {
  listByWorker(workerId: number, companyId: number): Promise<WorkerDocumentItem[]>;
  findByIdInCompany(
    id: number,
    workerId: number,
    companyId: number,
  ): Promise<WorkerDocumentRecord | null>;
  listKeysByWorker(workerId: number, companyId: number): Promise<string[]>;
  create(data: CreateWorkerDocumentData): Promise<WorkerDocumentRecord>;
  deleteInCompany(id: number, workerId: number, companyId: number): Promise<boolean>;
}

/** Metadata projection — omits `storageKey`/`checksum`/`companyId` (data minimization). */
const ITEM_SELECT = {
  id: true,
  workerId: true,
  docType: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

export class WorkerDocumentsRepository implements IWorkerDocumentsRepository {
  async listByWorker(workerId: number, companyId: number): Promise<WorkerDocumentItem[]> {
    return prisma.workerDocument.findMany({
      where: { workerId, companyId },
      orderBy: { id: 'asc' },
      select: ITEM_SELECT,
    }) as Promise<WorkerDocumentItem[]>;
  }

  async findByIdInCompany(
    id: number,
    workerId: number,
    companyId: number,
  ): Promise<WorkerDocumentRecord | null> {
    // Tenant + parent conditions inside the query: a foreign-company or
    // wrong-worker id misses → null → 404 upstream, never leaking existence.
    return prisma.workerDocument.findFirst({
      where: { id, workerId, companyId },
    }) as Promise<WorkerDocumentRecord | null>;
  }

  async listKeysByWorker(workerId: number, companyId: number): Promise<string[]> {
    const rows = await prisma.workerDocument.findMany({
      where: { workerId, companyId },
      select: { storageKey: true },
    });
    return rows.map((r) => r.storageKey);
  }

  async create(data: CreateWorkerDocumentData): Promise<WorkerDocumentRecord> {
    return prisma.workerDocument.create({ data }) as Promise<WorkerDocumentRecord>;
  }

  async deleteInCompany(id: number, workerId: number, companyId: number): Promise<boolean> {
    const result = await prisma.workerDocument.deleteMany({ where: { id, workerId, companyId } });
    return result.count > 0;
  }
}

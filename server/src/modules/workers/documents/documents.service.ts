import crypto from 'crypto';
import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import type { IFileStorage } from '../../../shared/storage/fileStorage';
import type {
  IWorkerDocumentsRepository,
  WorkerDocumentItem,
} from './documents.repository';
import type { UploadDocumentDto } from './documents.schema';
import { sniffFileType, mimeForType, MAX_FILE_BYTES } from './documents.schema';

/** Minimal parent-worker lookup — satisfied by `WorkersRepository.findByIdInCompany`. */
export interface IWorkerLookup {
  findByIdInCompany(id: number, companyId: number): Promise<{ id: number } | null>;
}

/** The multipart file as multer hands it to us (memory storage). */
export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Decrypted bytes + metadata for a download response. */
export interface DownloadResult {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export class WorkerDocumentsService {
  constructor(
    private readonly repo: IWorkerDocumentsRepository,
    private readonly workers: IWorkerLookup,
    private readonly storage: IFileStorage,
    private readonly audit: IAuditLogger,
  ) {}

  async list(workerId: number, currentUser: CurrentUser): Promise<WorkerDocumentItem[]> {
    await this.assertWorkerInCompany(workerId, currentUser.companyId);
    return this.repo.listByWorker(workerId, currentUser.companyId);
  }

  async upload(
    workerId: number,
    file: UploadedFile | undefined,
    dto: UploadDocumentDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<WorkerDocumentItem> {
    await this.assertWorkerInCompany(workerId, currentUser.companyId);

    if (!file) {
      throw new AppError('A file is required', 400);
    }
    // Defense-in-depth: multer enforces this, but never rely on a single guard.
    if (file.size > MAX_FILE_BYTES) {
      throw new AppError('File is too large', 400);
    }
    // Authoritative content check — never trust the browser-supplied MIME (§16).
    const sniffed = sniffFileType(file.buffer);
    if (!sniffed) {
      throw new AppError('Unsupported file type', 400);
    }

    const storageKey = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    // Persist the (encrypted-at-rest) bytes first; the metadata row points at them.
    await this.storage.save(storageKey, file.buffer);

    let record;
    try {
      record = await this.repo.create({
        companyId: currentUser.companyId,
        workerId,
        docType: dto.docType,
        originalName: sanitizeFilename(file.originalname),
        storageKey,
        mimeType: mimeForType(sniffed),
        size: file.size,
        checksum,
      });
    } catch (err) {
      // Roll back the orphaned object if the metadata write fails.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_DOCUMENT_UPLOADED,
      resourceType: RESOURCE_TYPES.WORKER_DOCUMENT,
      resourceId: String(record.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Non-sensitive metadata only — never the original filename or bytes (§18).
      metadata: { workerId, docType: dto.docType },
    });

    return toItem(record);
  }

  async download(
    workerId: number,
    id: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<DownloadResult> {
    const doc = await this.repo.findByIdInCompany(id, workerId, currentUser.companyId);
    if (!doc) {
      throw new AppError('Document not found', 404);
    }
    const buffer = await this.storage.read(doc.storageKey);

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_DOCUMENT_DOWNLOADED,
      resourceType: RESOURCE_TYPES.WORKER_DOCUMENT,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { workerId, docType: doc.docType },
    });

    return { buffer, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  async remove(
    workerId: number,
    id: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<void> {
    const doc = await this.repo.findByIdInCompany(id, workerId, currentUser.companyId);
    if (!doc) {
      throw new AppError('Document not found', 404);
    }
    // Remove the row first (tenant-scoped); then best-effort delete the object.
    await this.repo.deleteInCompany(id, workerId, currentUser.companyId);
    await this.storage.delete(doc.storageKey).catch(() => undefined);

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_DOCUMENT_DELETED,
      resourceType: RESOURCE_TYPES.WORKER_DOCUMENT,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { workerId, docType: doc.docType },
    });
  }

  /** Confirm the parent worker exists in the caller's company (else 404, no leak). */
  private async assertWorkerInCompany(workerId: number, companyId: number): Promise<void> {
    const worker = await this.workers.findByIdInCompany(workerId, companyId);
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }
  }
}

/**
 * Removes the stored FILES for all of a worker's documents (used when the parent
 * worker is deleted — the DB rows cascade, the physical objects do not). Satisfies
 * `IWorkerDocumentCleanup` in `workers.service.ts`. Tenant-scoped: a worker not in
 * the given company yields no keys, so nothing is deleted.
 */
export class WorkerDocumentCleanup {
  constructor(
    private readonly repo: IWorkerDocumentsRepository,
    private readonly storage: IFileStorage,
  ) {}

  async deleteFilesForWorker(workerId: number, companyId: number): Promise<void> {
    const keys = await this.repo.listKeysByWorker(workerId, companyId);
    await Promise.all(keys.map((key) => this.storage.delete(key).catch(() => undefined)));
  }
}

function toItem(r: WorkerDocumentItem): WorkerDocumentItem {
  return {
    id: r.id,
    workerId: r.workerId,
    docType: r.docType,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: r.size,
    createdAt: r.createdAt,
  };
}

/**
 * Sanitize a client-supplied filename kept for display: strip path separators and
 * control chars (incl. CR/LF, which would enable header injection in the
 * Content-Disposition download header), and cap length.
 */
function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, ''); // drop any path component
  // Keep printable chars only; drop control chars (incl. CR/LF → header
  // injection) and double-quotes (would break the Content-Disposition header).
  const cleaned = base
    .split('')
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c !== 0x7f && ch !== '"';
    })
    .join('')
    .trim();
  return (cleaned || 'document').slice(0, 200);
}

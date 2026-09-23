import { AppError } from '../../shared/errors/AppError';
import type { WorkerPrincipal } from '../../shared/middlewares/authenticateWorker';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IFileStorage } from '../../shared/storage/fileStorage';
import type {
  IWorkerPortalRepository,
  WorkerSelfProfile,
  WorkerSelfDocument,
  WorkerSelfHousing,
  WorkerSelfInspection,
  WorkerSelfRequest,
} from './workerPortal.repository';
import type { CreateRequestDto } from './workerPortal.schema';

/** A single derived document-expiry alert (status computed at read time). */
export interface WorkerAlert {
  type: 'passport' | 'visa' | 'insurance';
  expiryDate: Date;
  daysUntilExpiry: number;
  status: 'expired' | 'expiring' | 'valid';
}

/** Decrypted bytes + metadata for a download response. */
export interface WorkerDownloadResult {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

/** Documents within this window (days) are flagged as "expiring" (mirrors the 90-day tier). */
const EXPIRING_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Worker-portal business logic (SECURITY_PRINCIPLES.md §5/§6/§7). Every method is
 * driven ONLY by the `WorkerPrincipal` (set by `authenticateWorker`) — the worker's
 * own id and company. There is no cross-worker or cross-tenant surface here.
 */
export class WorkerPortalService {
  constructor(
    private readonly repo: IWorkerPortalRepository,
    private readonly storage: IFileStorage,
    private readonly audit: IAuditLogger,
  ) {}

  async getProfile(principal: WorkerPrincipal): Promise<WorkerSelfProfile> {
    const profile = await this.repo.getProfile(principal.workerId, principal.companyId);
    if (!profile) {
      // Should be unreachable for a valid token (the principal came from a live row),
      // but fail closed rather than assume.
      throw new AppError('Worker not found', 404);
    }
    return profile;
  }

  async listDocuments(principal: WorkerPrincipal): Promise<WorkerSelfDocument[]> {
    return this.repo.listDocuments(principal.workerId, principal.companyId);
  }

  async downloadDocument(
    principal: WorkerPrincipal,
    documentId: number,
    context: AuditContext,
  ): Promise<WorkerDownloadResult> {
    const doc = await this.repo.findDownload(documentId, principal.workerId, principal.companyId);
    if (!doc) {
      throw new AppError('Document not found', 404);
    }
    const buffer = await this.storage.read(doc.storageKey);

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_DOCUMENT_DOWNLOADED,
      resourceType: RESOURCE_TYPES.WORKER_DOCUMENT,
      resourceId: String(documentId),
      // The actor here is the worker principal (not a staff user).
      actor: { companyId: principal.companyId },
      context,
      // Non-sensitive metadata only — never the original filename or bytes (§18).
      metadata: { workerId: principal.workerId, docType: doc.docType, via: 'worker_portal' },
    });

    return { buffer, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  async getHousing(principal: WorkerPrincipal): Promise<WorkerSelfHousing | null> {
    return this.repo.getHousing(principal.workerId, principal.companyId);
  }

  /** The next inspection for the worker's own assigned property (null if none). */
  async getInspection(principal: WorkerPrincipal): Promise<WorkerSelfInspection | null> {
    return this.repo.getInspection(principal.workerId, principal.companyId);
  }

  /** Derive passport/visa/insurance expiry alerts from the worker's own dates. */
  async getAlerts(principal: WorkerPrincipal): Promise<WorkerAlert[]> {
    const profile = await this.repo.getProfile(principal.workerId, principal.companyId);
    if (!profile) {
      throw new AppError('Worker not found', 404);
    }
    const now = Date.now();
    const alerts: WorkerAlert[] = [];
    const pairs: Array<[WorkerAlert['type'], Date | null]> = [
      ['passport', profile.passportExpiry],
      ['visa', profile.visaExpiry],
      ['insurance', profile.insuranceExpiry],
    ];
    for (const [type, expiryDate] of pairs) {
      if (!expiryDate) continue;
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now) / MS_PER_DAY);
      const status: WorkerAlert['status'] =
        daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry <= EXPIRING_WINDOW_DAYS ? 'expiring' : 'valid';
      alerts.push({ type, expiryDate, daysUntilExpiry, status });
    }
    return alerts;
  }

  async createRequest(
    principal: WorkerPrincipal,
    dto: CreateRequestDto,
    context: AuditContext,
  ): Promise<WorkerSelfRequest> {
    const request = await this.repo.createRequest(
      principal.workerId,
      principal.companyId,
      dto.type,
      dto.message,
    );
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_REQUEST_CREATED,
      resourceType: RESOURCE_TYPES.WORKER_REQUEST,
      resourceId: String(request.id),
      actor: { companyId: principal.companyId },
      context,
      // Field names / type only — never the free-text message body (may be PII).
      metadata: { workerId: principal.workerId, type: dto.type },
    });
    return request;
  }

  async listRequests(principal: WorkerPrincipal): Promise<WorkerSelfRequest[]> {
    return this.repo.listRequests(principal.workerId, principal.companyId);
  }
}

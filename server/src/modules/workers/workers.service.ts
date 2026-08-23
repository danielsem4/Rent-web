import { AppError } from '../../shared/errors/AppError';
import type { CurrentUser } from '../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type {
  IWorkersRepository,
  WorkerRecord,
  WorkerListItem,
} from './workers.repository';
import type { CreateWorkerDto, UpdateWorkerDto } from './workers.schema';

/**
 * Minimal contract for verifying an apartment assignment. Satisfied by the
 * existing `PropertiesRepository.findByIdInCompany` — a foreign-company property
 * id returns null, which we treat as an invalid assignment. Injected (rather than
 * importing the class) so the guard is testable in isolation.
 */
export interface IPropertyLookup {
  findByIdInCompany(
    id: number,
    companyId: number,
  ): Promise<{ id: number; maxCapacity: number } | null>;
}

/**
 * Deletes the stored FILES for a worker's documents (the DB rows cascade-delete
 * with the worker; the physical objects do not, so they are cleaned up here).
 * Satisfied by `WorkerDocumentCleanup` in the documents sub-module. Tenant-scoped.
 */
export interface IWorkerDocumentCleanup {
  deleteFilesForWorker(workerId: number, companyId: number): Promise<void>;
}

export class WorkersService {
  constructor(
    private readonly repo: IWorkersRepository,
    private readonly properties: IPropertyLookup,
    private readonly documents: IWorkerDocumentCleanup,
    private readonly audit: IAuditLogger,
  ) {}

  async list(currentUser: CurrentUser): Promise<WorkerListItem[]> {
    return this.repo.listByCompany(currentUser.companyId);
  }

  async get(id: number, currentUser: CurrentUser): Promise<WorkerRecord> {
    const worker = await this.repo.findByIdInCompany(id, currentUser.companyId);
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }
    return worker;
  }

  async create(
    dto: CreateWorkerDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<WorkerRecord> {
    // A worker may be assigned to a property, but ONLY one owned by the caller's
    // company — reject a cross-tenant reference (BOLA, §6). When assigning, the
    // property must also have room (capacity is the live worker count).
    const targetProperty = await this.assertPropertyInCompany(
      dto.propertyId,
      currentUser.companyId,
    );
    if (targetProperty) {
      await this.assertNotFull(targetProperty.id, currentUser.companyId, targetProperty.maxCapacity);
    }

    // Company ownership always comes from the trusted context, never the body.
    const worker = await this.repo.createInCompany({
      ...dto,
      companyId: currentUser.companyId,
    });

    // Keep the property's `total` occupancy in step with the live worker count.
    if (dto.propertyId != null) {
      await this.repo.syncPropertyTotals([dto.propertyId], currentUser.companyId);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_CREATED,
      resourceType: RESOURCE_TYPES.WORKER,
      resourceId: String(worker.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Field NAMES only — never values (passport / insurance numbers must not
      // reach the trail, §18).
      metadata: { fields: Object.keys(dto) },
    });
    return worker;
  }

  async update(
    id: number,
    dto: UpdateWorkerDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<WorkerRecord> {
    // Only when the assignment is actually being changed do we need the worker's
    // current property (to know what it is MOVING from) and a capacity guard.
    let previousPropertyId: number | null | undefined;
    if (dto.propertyId !== undefined) {
      const existing = await this.repo.findByIdInCompany(id, currentUser.companyId);
      if (!existing) {
        throw new AppError('Worker not found', 404);
      }
      previousPropertyId = existing.propertyId;

      const targetProperty = await this.assertPropertyInCompany(
        dto.propertyId,
        currentUser.companyId,
      );
      // Guard capacity only when moving INTO a different property — re-saving the
      // same assignment must not count the worker against itself.
      if (targetProperty && dto.propertyId !== previousPropertyId) {
        await this.assertNotFull(
          targetProperty.id,
          currentUser.companyId,
          targetProperty.maxCapacity,
        );
      }
    }

    const updated = await this.repo.updateInCompany(id, currentUser.companyId, dto);
    if (!updated) {
      throw new AppError('Worker not found', 404);
    }

    // Recompute occupancy for BOTH the source and destination properties.
    if (dto.propertyId !== undefined) {
      await this.repo.syncPropertyTotals(
        [previousPropertyId, dto.propertyId],
        currentUser.companyId,
      );
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_UPDATED,
      resourceType: RESOURCE_TYPES.WORKER,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async remove(id: number, currentUser: CurrentUser, context: AuditContext): Promise<void> {
    // Capture the worker's property BEFORE deletion so we can recompute that
    // property's occupancy afterwards (mirrors create/update). Tenant-scoped.
    const worker = await this.repo.findByIdInCompany(id, currentUser.companyId);
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    // Delete the worker's stored document FILES first (tenant-scoped — a
    // foreign-company worker matches no rows, so nothing is deleted). The DB
    // document rows then cascade-delete with the worker below.
    await this.documents.deleteFilesForWorker(id, currentUser.companyId);

    const deleted = await this.repo.deleteInCompany(id, currentUser.companyId);
    if (!deleted) {
      throw new AppError('Worker not found', 404);
    }

    // Recompute the ex-property's stored `total` from the live worker count now
    // that this row is gone; without it the occupancy chip/bar stays stale.
    if (worker.propertyId != null) {
      await this.repo.syncPropertyTotals([worker.propertyId], currentUser.companyId);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_DELETED,
      resourceType: RESOURCE_TYPES.WORKER,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
    });
  }

  /**
   * When a `propertyId` is provided (and non-null), verify it belongs to the
   * caller's company and return it (so the caller can read `maxCapacity`).
   * `null` clears the assignment; `undefined` leaves it untouched on a partial
   * update — neither needs a lookup, and both return null.
   */
  private async assertPropertyInCompany(
    propertyId: number | null | undefined,
    companyId: number,
  ): Promise<{ id: number; maxCapacity: number } | null> {
    if (propertyId === undefined || propertyId === null) return null;
    const property = await this.properties.findByIdInCompany(propertyId, companyId);
    if (!property) {
      throw new AppError('Assigned property not found', 400);
    }
    return property;
  }

  /**
   * Occupancy guard: a property is full when the live count of workers assigned
   * to it has reached `maxCapacity`. Called BEFORE the assigning write, so the
   * incoming worker is not yet counted — `>=` is the correct boundary.
   *
   * Note: the count and the subsequent write are not one transaction, so two
   * simultaneous assignments to the last slot could both pass. That race is
   * acceptable for this internal, manager-only tool, and `syncPropertyTotals`
   * recomputes `total` from truth afterwards so the stored figure stays correct.
   */
  private async assertNotFull(
    propertyId: number,
    companyId: number,
    maxCapacity: number,
  ): Promise<void> {
    const occupied = await this.repo.countByProperty(propertyId, companyId);
    if (occupied >= maxCapacity) {
      throw new AppError('Property is at full capacity', 409);
    }
  }
}

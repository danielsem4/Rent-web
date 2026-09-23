import prisma from '../../lib/prisma';
import type { WorkerDocumentType, WorkerRequestType, WorkerRequestStatus } from '@prisma/client';

/**
 * Reads/writes for the authenticated WORKER principal's own data
 * (SECURITY_PRINCIPLES.md §5/§6/§7). The ONLY layer that touches `prisma`. EVERY
 * method is scoped by BOTH `workerId` AND `companyId` taken from the worker
 * principal (never from the request), so a worker can only ever see their own
 * records within their own tenant.
 *
 * DATA MINIMIZATION: the profile projection deliberately OMITS the encrypted
 * passport / insurance identifiers (the `*Enc` columns are never selected), so the
 * regulated numbers never leave the DB onto the mobile transport. Only the expiry
 * DATES (needed for alerts) and non-sensitive profile fields are exposed.
 */

/** Non-decrypted self-profile — no regulated identifier numbers. */
export interface WorkerSelfProfile {
  id: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate: Date | null;
  preferredLanguage: string | null;
  passportExpiry: Date | null;
  visaType: string | null;
  visaExpiry: Date | null;
  insuranceProvider: string | null;
  insuranceCoverageType: string | null;
  insuranceExpiry: Date | null;
  phone: string | null;
  employer: string | null;
  propertyId: number | null;
}

/** A worker's own document (metadata only — bytes streamed via download). */
export interface WorkerSelfDocument {
  id: number;
  docType: WorkerDocumentType;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Decrypt-on-stream download target for a worker's own document. */
export interface WorkerSelfDownload {
  storageKey: string;
  mimeType: string;
  originalName: string;
  docType: WorkerDocumentType;
}

/** The worker's assigned housing (resident-relevant fields only). */
export interface WorkerSelfHousing {
  id: number;
  city: string;
  address: string;
  entryCode: string | null;
  rooms: number | null;
}

export interface WorkerSelfRequest {
  id: number;
  type: WorkerRequestType;
  message: string;
  status: WorkerRequestStatus;
  createdAt: Date;
}

/** The next inspection for the worker's assigned property (dates + notes only). */
export interface WorkerSelfInspection {
  lastInspectionDate: Date | null;
  nextInspectionDate: Date | null;
  notes: string | null;
}

const PROFILE_SELECT = {
  id: true,
  nameHe: true,
  nameEn: true,
  nationality: true,
  entryDate: true,
  preferredLanguage: true,
  passportExpiry: true,
  visaType: true,
  visaExpiry: true,
  insuranceProvider: true,
  insuranceCoverageType: true,
  insuranceExpiry: true,
  phone: true,
  employer: true,
  propertyId: true,
} as const;

export interface IWorkerPortalRepository {
  getProfile(workerId: number, companyId: number): Promise<WorkerSelfProfile | null>;
  listDocuments(workerId: number, companyId: number): Promise<WorkerSelfDocument[]>;
  findDownload(
    documentId: number,
    workerId: number,
    companyId: number,
  ): Promise<WorkerSelfDownload | null>;
  getHousing(workerId: number, companyId: number): Promise<WorkerSelfHousing | null>;
  getInspection(workerId: number, companyId: number): Promise<WorkerSelfInspection | null>;
  createRequest(
    workerId: number,
    companyId: number,
    type: WorkerRequestType,
    message: string,
  ): Promise<WorkerSelfRequest>;
  listRequests(workerId: number, companyId: number): Promise<WorkerSelfRequest[]>;
}

export class WorkerPortalRepository implements IWorkerPortalRepository {
  async getProfile(workerId: number, companyId: number): Promise<WorkerSelfProfile | null> {
    // Scoped by BOTH id and companyId — a mismatch (impossible for a real token,
    // but defense-in-depth) returns null.
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: PROFILE_SELECT,
    });
    return worker;
  }

  async listDocuments(workerId: number, companyId: number): Promise<WorkerSelfDocument[]> {
    return prisma.workerDocument.findMany({
      where: { workerId, companyId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        docType: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
  }

  async findDownload(
    documentId: number,
    workerId: number,
    companyId: number,
  ): Promise<WorkerSelfDownload | null> {
    const doc = await prisma.workerDocument.findFirst({
      where: { id: documentId, workerId, companyId },
      select: { storageKey: true, mimeType: true, originalName: true, docType: true },
    });
    return doc;
  }

  async getHousing(workerId: number, companyId: number): Promise<WorkerSelfHousing | null> {
    // Resolve the worker's assigned property within the same tenant. A worker with
    // no assignment (propertyId null) yields null.
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: {
        property: {
          select: { id: true, city: true, address: true, entryCode: true, rooms: true },
        },
      },
    });
    return worker?.property ?? null;
  }

  async getInspection(
    workerId: number,
    companyId: number,
  ): Promise<WorkerSelfInspection | null> {
    // Resolve the worker's OWN assigned property first (scoped by companyId) — the
    // propertyId is never taken from the request, mirroring getHousing above. A
    // worker with no assignment yields null.
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: { propertyId: true },
    });
    if (!worker?.propertyId) return null;

    // Scoped by BOTH the worker's own propertyId AND companyId (tenant isolation).
    // Most-imminent-first, so a worker sees the upcoming inspection for their home.
    const inspection = await prisma.inspection.findFirst({
      where: { propertyId: worker.propertyId, companyId },
      orderBy: { nextInspectionDate: 'desc' },
      select: { lastInspectionDate: true, nextInspectionDate: true, notes: true },
    });
    return inspection;
  }

  async createRequest(
    workerId: number,
    companyId: number,
    type: WorkerRequestType,
    message: string,
  ): Promise<WorkerSelfRequest> {
    // companyId/workerId/status are set here from the trusted principal — never from
    // the request body (mass-assignment defense). status defaults to OPEN.
    const request = await prisma.workerRequest.create({
      data: { workerId, companyId, type, message },
      select: { id: true, type: true, message: true, status: true, createdAt: true },
    });
    return request;
  }

  async listRequests(workerId: number, companyId: number): Promise<WorkerSelfRequest[]> {
    return prisma.workerRequest.findMany({
      where: { workerId, companyId },
      orderBy: { id: 'desc' },
      select: { id: true, type: true, message: true, status: true, createdAt: true },
    });
  }
}

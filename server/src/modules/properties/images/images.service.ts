import crypto from 'crypto';
import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import type { IFileStorage } from '../../../shared/storage/fileStorage';
import type { IPropertyImagesRepository, PropertyImageItem } from './images.repository';
import { sniffFileType, mimeForType, MAX_FILE_BYTES } from './images.schema';

/** Minimal parent-property lookup — satisfied by `PropertiesRepository.findByIdInCompany`. */
export interface IPropertyLookup {
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

export class PropertyImagesService {
  constructor(
    private readonly repo: IPropertyImagesRepository,
    private readonly properties: IPropertyLookup,
    private readonly storage: IFileStorage,
    private readonly audit: IAuditLogger,
  ) {}

  async list(propertyId: number, currentUser: CurrentUser): Promise<PropertyImageItem[]> {
    await this.assertPropertyInCompany(propertyId, currentUser.companyId);
    return this.repo.listByProperty(propertyId, currentUser.companyId);
  }

  async upload(
    propertyId: number,
    file: UploadedFile | undefined,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<PropertyImageItem> {
    await this.assertPropertyInCompany(propertyId, currentUser.companyId);

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
        propertyId,
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
      action: AUDIT_ACTIONS.PROPERTY_IMAGE_UPLOADED,
      resourceType: RESOURCE_TYPES.PROPERTY_IMAGE,
      resourceId: String(record.id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Non-sensitive metadata only — never the original filename or bytes (§18).
      metadata: { propertyId },
    });

    return toItem(record);
  }

  async download(
    propertyId: number,
    id: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<DownloadResult> {
    const image = await this.repo.findByIdInCompany(id, propertyId, currentUser.companyId);
    if (!image) {
      throw new AppError('Image not found', 404);
    }
    const buffer = await this.storage.read(image.storageKey);

    await this.audit.log({
      action: AUDIT_ACTIONS.PROPERTY_IMAGE_DOWNLOADED,
      resourceType: RESOURCE_TYPES.PROPERTY_IMAGE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId },
    });

    return { buffer, mimeType: image.mimeType, originalName: image.originalName };
  }

  async remove(
    propertyId: number,
    id: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<void> {
    const image = await this.repo.findByIdInCompany(id, propertyId, currentUser.companyId);
    if (!image) {
      throw new AppError('Image not found', 404);
    }
    // Remove the row first (tenant-scoped); then best-effort delete the object.
    await this.repo.deleteInCompany(id, propertyId, currentUser.companyId);
    await this.storage.delete(image.storageKey).catch(() => undefined);

    await this.audit.log({
      action: AUDIT_ACTIONS.PROPERTY_IMAGE_DELETED,
      resourceType: RESOURCE_TYPES.PROPERTY_IMAGE,
      resourceId: String(id),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { propertyId },
    });
  }

  /** Confirm the parent property exists in the caller's company (else 404, no leak). */
  private async assertPropertyInCompany(propertyId: number, companyId: number): Promise<void> {
    const property = await this.properties.findByIdInCompany(propertyId, companyId);
    if (!property) {
      throw new AppError('Property not found', 404);
    }
  }
}

/**
 * Removes the stored FILES for all of a property's images (used when the parent
 * property is deleted — the DB rows cascade, the physical objects do not). Satisfies
 * `IPropertyImageCleanup` in `properties.service.ts`. Tenant-scoped: a property not
 * in the given company yields no keys, so nothing is deleted.
 */
export class PropertyImageCleanup {
  constructor(
    private readonly repo: IPropertyImagesRepository,
    private readonly storage: IFileStorage,
  ) {}

  async deleteFilesForProperty(propertyId: number, companyId: number): Promise<void> {
    const keys = await this.repo.listKeysByProperty(propertyId, companyId);
    await Promise.all(keys.map((key) => this.storage.delete(key).catch(() => undefined)));
  }
}

function toItem(r: PropertyImageItem): PropertyImageItem {
  return {
    id: r.id,
    propertyId: r.propertyId,
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
  const cleaned = base
    .split('')
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c !== 0x7f && ch !== '"';
    })
    .join('')
    .trim();
  return (cleaned || 'image').slice(0, 200);
}

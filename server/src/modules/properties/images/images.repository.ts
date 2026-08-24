import prisma from '../../../lib/prisma';

/**
 * Property-image METADATA store (SECURITY_PRINCIPLES.md §16). The bytes live in
 * the file-storage backend, never here — this table holds only the row that
 * describes a stored object. Tenant-isolated by `companyId`, mirroring
 * `properties.repository.ts` and `documents.repository.ts`.
 */

/** Metadata returned to clients (never includes bytes or the storage key). */
export interface PropertyImageItem {
  id: number;
  propertyId: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Full record incl. the internal `storageKey` — used server-side only (download/delete). */
export interface PropertyImageRecord extends PropertyImageItem {
  companyId: number;
  storageKey: string;
  checksum: string;
}

export interface CreatePropertyImageData {
  companyId: number;
  propertyId: number;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
}

export interface IPropertyImagesRepository {
  listByProperty(propertyId: number, companyId: number): Promise<PropertyImageItem[]>;
  findByIdInCompany(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<PropertyImageRecord | null>;
  listKeysByProperty(propertyId: number, companyId: number): Promise<string[]>;
  create(data: CreatePropertyImageData): Promise<PropertyImageRecord>;
  deleteInCompany(id: number, propertyId: number, companyId: number): Promise<boolean>;
}

/** Metadata projection — omits `storageKey`/`checksum`/`companyId` (data minimization). */
const ITEM_SELECT = {
  id: true,
  propertyId: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

export class PropertyImagesRepository implements IPropertyImagesRepository {
  async listByProperty(propertyId: number, companyId: number): Promise<PropertyImageItem[]> {
    return prisma.propertyImage.findMany({
      where: { propertyId, companyId },
      orderBy: { id: 'asc' },
      select: ITEM_SELECT,
    }) as Promise<PropertyImageItem[]>;
  }

  async findByIdInCompany(
    id: number,
    propertyId: number,
    companyId: number,
  ): Promise<PropertyImageRecord | null> {
    // Tenant + parent conditions inside the query: a foreign-company or
    // wrong-property id misses → null → 404 upstream, never leaking existence.
    return prisma.propertyImage.findFirst({
      where: { id, propertyId, companyId },
    }) as Promise<PropertyImageRecord | null>;
  }

  async listKeysByProperty(propertyId: number, companyId: number): Promise<string[]> {
    const rows = await prisma.propertyImage.findMany({
      where: { propertyId, companyId },
      select: { storageKey: true },
    });
    return rows.map((r) => r.storageKey);
  }

  async create(data: CreatePropertyImageData): Promise<PropertyImageRecord> {
    return prisma.propertyImage.create({ data }) as Promise<PropertyImageRecord>;
  }

  async deleteInCompany(id: number, propertyId: number, companyId: number): Promise<boolean> {
    const result = await prisma.propertyImage.deleteMany({ where: { id, propertyId, companyId } });
    return result.count > 0;
  }
}

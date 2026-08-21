import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from '../errors/AppError';
import { encryptBuffer, decryptBuffer } from '../utils/fieldEncryption';
import type { IFileStorage } from './fileStorage';

/**
 * Local-disk implementation of {@link IFileStorage} (SECURITY_PRINCIPLES.md §16).
 *
 * - **Encrypted at rest:** bytes are AES-256-GCM encrypted (via `encryptBuffer`)
 *   before they touch the disk, and decrypted on read. The on-disk file is
 *   ciphertext — a passport scan never sits in plaintext on the filesystem.
 * - **Private location:** the base directory is outside any web-served path (the
 *   app serves no static files), so objects are reachable only through the
 *   authenticated, tenant-scoped download endpoint.
 * - **Traversal guard:** keys are server-generated UUIDs, but the resolved path is
 *   still asserted to stay within the base directory (defense-in-depth).
 *
 * A future `S3FileStorage` implements the same interface using a private bucket +
 * SSE; the documents module is unaffected by the swap.
 */
export class LocalFileStorage implements IFileStorage {
  constructor(private readonly baseDir: string) {}

  /** Resolve `key` under the base dir and reject anything that escapes it. */
  private resolve(key: string): string {
    const target = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new AppError('Invalid storage key', 400);
    }
    return target;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, encryptBuffer(data), { mode: 0o600 });
  }

  async read(key: string): Promise<Buffer> {
    const target = this.resolve(key);
    const stored = await fs.readFile(target);
    return decryptBuffer(stored);
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    // Idempotent: a missing file is not an error (already deleted).
    await fs.rm(target, { force: true });
  }
}

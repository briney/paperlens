import fs from "fs/promises";
import path from "path";
import type { StorageProvider } from "./types";
import { normalizeStoragePath } from "./path";

const STORAGE_DIR = path.resolve(process.cwd(), ".storage");
const STORAGE_DIR_PREFIX = `${STORAGE_DIR}${path.sep}`;

export class LocalStorageProvider implements StorageProvider {
  private async ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  private resolvePath(storagePath: string): string {
    const normalizedStoragePath = normalizeStoragePath(storagePath);
    const resolvedPath = path.resolve(STORAGE_DIR, normalizedStoragePath);

    if (resolvedPath !== STORAGE_DIR && !resolvedPath.startsWith(STORAGE_DIR_PREFIX)) {
      throw new Error("Storage path escapes storage root");
    }

    return resolvedPath;
  }

  async upload(
    storagePath: string,
    data: Buffer,
    _contentType?: string
  ): Promise<string> {
    const fullPath = this.resolvePath(storagePath);
    await this.ensureDir(fullPath);
    await fs.writeFile(fullPath, data);
    return storagePath;
  }

  async download(storagePath: string): Promise<Buffer> {
    const fullPath = this.resolvePath(storagePath);
    return fs.readFile(fullPath);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.resolvePath(storagePath);
    await fs.unlink(fullPath).catch(() => {
      // Ignore if file doesn't exist
    });
  }

  async exists(storagePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(storagePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(storagePath: string): Promise<string> {
    // In local mode, serve via an API route
    return `/api/storage/${encodeURIComponent(storagePath)}`;
  }
}

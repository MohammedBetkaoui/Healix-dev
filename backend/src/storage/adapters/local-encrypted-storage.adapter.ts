import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, rmdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { type Readable } from 'node:stream';

import {
  fileIntegrityFailed,
  fileNotFound,
  StorageKeyExistsError,
  storageUnavailable,
} from '../storage-errors';
import { type StorageAdapter } from '../storage.types';

// The storage of the development (and of any single-server deployment that
// does not mount an object store): plain files under STORAGE_LOCAL_ROOT, a
// folder that is served by nothing — not by Nest (no static assets), not by
// Caddy (only /api/* and /viewer/* are routed), and that stays out of the
// web roots. The sensitive files reach it already encrypted: what is on disk
// is the ciphertext of the file format, never the plaintext.
//
// Every path is resolved and checked against the root before anything is
// opened, written or removed: a reference read back from the database cannot
// escape the folder (no ../ traversal).
@Injectable()
export class LocalEncryptedStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(configuredRoot: string | undefined) {
    this.root = resolve(process.cwd(), configuredRoot ?? './storage-private');
  }

  get rootPath(): string {
    return this.root;
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const path = this.resolveInside(key);

    try {
      await mkdir(dirname(path), { recursive: true });
      // The keys are unique: an existing object is never replaced.
      await writeFile(path, data, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new StorageKeyExistsError();
      }
      throw storageUnavailable();
    }
  }

  async read(key: string): Promise<Buffer> {
    const path = this.resolveInside(key);

    try {
      return await readFile(path);
    } catch (error) {
      throw mapReadError(error);
    }
  }

  async open(key: string, start = 0): Promise<Readable> {
    const path = this.resolveInside(key);

    if (!existsSync(path)) {
      throw fileNotFound();
    }

    return createReadStream(path, { start }) as Readable;
  }

  // The first `length` bytes, to read the format header before streaming.
  async readSlice(key: string, length: number): Promise<Buffer> {
    const path = this.resolveInside(key);
    const handle = await open(path, 'r').catch((error: unknown) => {
      throw mapReadError(error);
    });

    try {
      const slice = Buffer.alloc(Math.min(length, (await handle.stat()).size));
      const { bytesRead } = await handle.read(slice, 0, slice.length, 0);

      return slice.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveInside(key);

    try {
      await rm(path, { force: true });
      await this.removeEmptyParentDirectories(dirname(path));
    } catch {
      // The file may already be gone; the row is the source of truth.
    }
  }

  // The folder of a grouped artifact (a volumetry) and everything in it.
  async deletePrefix(prefix: string): Promise<void> {
    const path = this.resolveInside(prefix);

    try {
      await rm(path, { force: true, recursive: true });
      await this.removeEmptyParentDirectories(dirname(path));    } catch {
      // Same as delete(): already gone is fine.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveInside(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolveInside(reference: string): string {
    return this.ensureInside(resolve(this.root, reference));
  }

  private ensureInside(pathToCheck: string): string {
    const resolvedPath = resolve(pathToCheck);

    if (
      resolvedPath !== this.root &&
      !resolvedPath.startsWith(`${this.root}\\`) &&
      !resolvedPath.startsWith(`${this.root}/`)
    ) {
      // A reference that escapes the root is a data problem, not a user
      // error: it is answered with a controlled error, no path in the answer.
      throw fileIntegrityFailed();
    }

    return resolvedPath;
  }

  private async removeEmptyParentDirectories(directory: string): Promise<void> {
    if (directory === this.root || !directory.startsWith(this.root)) {
      return;
    }

    try {
      // rmdir only: a folder that still holds anything is kept (no recursive
      // removal here — deletePrefix is the one that empties a folder).
      await rmdir(directory);
      await this.removeEmptyParentDirectories(dirname(directory));
    } catch {
      // Non-empty directories are expected and should be preserved.
    }
  }
}

function mapReadError(error: unknown): Error {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return fileNotFound();
  }

  return storageUnavailable();
}

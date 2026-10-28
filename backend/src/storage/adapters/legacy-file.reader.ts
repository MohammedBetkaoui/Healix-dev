import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, type ReadStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Readable } from 'node:stream';

import { fileNotFound } from '../storage-errors';

// The compatibility read of the files that the migration script has not
// moved to the StorageService yet: their rows still hold a path under
// UPLOAD_ROOT, checked against it before anything is opened (the old rule,
// unchanged). Read-only on purpose — a write goes through StorageService,
// so the legacy folder keeps only what is left to migrate. Removed once the
// migration has emptied it.
@Injectable()
export class LegacyFileReader {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      process.cwd(),
      config.get<string>('UPLOAD_ROOT') ?? './uploads',
    );
  }

  async read(localPath: string): Promise<Buffer> {
    const path = this.ensureInside(localPath);

    try {
      return await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw fileNotFound();
      }
      throw error;
    }
  }

  open(localPath: string): Readable {
    const path = this.ensureInside(localPath);

    if (!existsSync(path)) {
      throw fileNotFound();
    }

    return createReadStream(path) as Readable;
  }

  async exists(localPath: string): Promise<boolean> {
    try {
      return existsSync(this.ensureInside(localPath));
    } catch {
      return false;
    }
  }

  // The old delete (a file, then the folders it empties), for the rows a
  // removal reaches before the migration script did.
  async delete(localPath: string): Promise<void> {
    try {
      await rm(this.ensureInside(localPath), { force: true });
    } catch {
      // Already gone: the row is the source of truth.
    }
  }

  async deleteFolder(folder: string): Promise<void> {
    try {
      await rm(this.ensureInside(folder), { force: true, recursive: true });
    } catch {
      // Already gone.
    }
  }

  private ensureInside(pathToCheck: string): string {
    // A reference may be an absolute path (the rows hold absolute paths
    // today) or a path relative to the upload root: both resolve against the
    // root, and both must stay inside it.
    const resolvedPath = resolve(this.root, pathToCheck);

    if (
      resolvedPath !== this.root &&
      !resolvedPath.startsWith(`${this.root}\\`) &&
      !resolvedPath.startsWith(`${this.root}/`)
    ) {
      throw fileNotFound();
    }

    return resolvedPath;
  }
}

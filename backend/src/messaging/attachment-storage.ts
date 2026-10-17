import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, open, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { UploadRoot } from '../common/utils/upload-root';
import { attachmentNotFound } from './messaging-errors';

// The encrypted files of the messaging, under
// UPLOAD_ROOT/messaging/<conversationId>/<attachmentId>.bin: inside the
// volume the nightly backup archives. Every path, written or read back from
// the database, is checked against the upload root first.
@Injectable()
export class AttachmentStorage {
  private readonly root: UploadRoot;

  constructor(config: ConfigService) {
    this.root = new UploadRoot(config.get<string>('UPLOAD_ROOT'));
  }

  // Never overwrites a file: each attachment has its own.
  async write(
    conversationId: string,
    attachmentId: string,
    data: Buffer,
  ): Promise<string> {
    const path = this.root.resolve(
      'messaging',
      conversationId,
      `${attachmentId}.bin`,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
    return path;
  }

  // The first headerLength bytes (the encryption header), then the rest of
  // the file as a stream. A missing or truncated file is a 404.
  async open(
    storagePath: string,
    headerLength: number,
  ): Promise<{ header: Buffer; body: ReadStream }> {
    const path = this.root.ensureInside(storagePath);
    const handle = await open(path, 'r').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw attachmentNotFound();
      }
      throw error;
    });

    try {
      const header = Buffer.alloc(headerLength);
      const { bytesRead } = await handle.read(header, 0, headerLength, 0);
      if (bytesRead < headerLength) throw attachmentNotFound();
      return { body: createReadStream(path, { start: headerLength }), header };
    } finally {
      await handle.close();
    }
  }

  // The file, then its conversation's folder once empty.
  async remove(storagePath: string): Promise<void> {
    const path = this.root.ensureInside(storagePath);
    await rm(path, { force: true });
    await rmdir(dirname(path)).catch(() => undefined);
  }
}

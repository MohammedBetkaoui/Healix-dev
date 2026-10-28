import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PassThrough, type Readable } from 'node:stream';

import { LegacyFileReader } from './adapters/legacy-file.reader';
import {
  FILE_HEADER_LENGTH,
  type FileEncryption,
} from './crypto/file-encryption.service';
import {
  createStorageKey,
  isStorageKey,
} from './storage-keys';
import {
  fileEmpty,
  fileIntegrityFailed,
  StorageKeyExistsError,
  storageNotConfigured,
} from './storage-errors';
import {
  ENCRYPTED_CLASSIFICATIONS,
  type PutObjectInput,
  type StorageAdapter,
  type StorageReference,
  type StoredObject,
} from './storage.types';

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
export const STORAGE_ENCRYPTION = Symbol('STORAGE_ENCRYPTION');

// The one door between the business services and the files. It knows how to
// store, read, stream, delete, verify, encrypt, decrypt — never who may see
// a file: that decision stays in the business service, which authorizes the
// resource before it asks for the object.
//
// A reference is either a modern opaque key (hx/...) or, during the
// transition, the legacy path of a file the migration script has not moved
// yet (read under UPLOAD_ROOT, unchanged). Business code passes the row's
// `storageKey ?? localPath`; the controllers only ever see document ids, and
// no filesystem path or endpoint ever reaches a client.
@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
    @Inject(STORAGE_ENCRYPTION)
    private readonly encryption: FileEncryption,
    private readonly legacy: LegacyFileReader,
  ) {}

  // Writes the file (encrypted first when its classification is a sensitive
  // one) under a key created here, and answers the metadata the caller
  // stores in its document's row. A sensitive write without a valid master
  // key is refused: fail closed.
  async put(input: PutObjectInput): Promise<StoredObject> {
    if (input.data.length === 0) {
      throw fileEmpty();
    }

    const encrypt = ENCRYPTED_CLASSIFICATIONS.has(input.classification);

    if (encrypt && !this.encryption.available) {
      throw storageNotConfigured();
    }

    for (let attempt = 0; ; attempt += 1) {
      const key = createStorageKey(input.classification);
      let data = input.data;
      let encryptionVersion: number | null = null;

      if (encrypt) {
        const encrypted = this.encryption.encrypt(input.data, key);
        data = encrypted.data;
        encryptionVersion = encrypted.version;
      }

      try {
        await this.adapter.put(key, data, input.mimeType);
      } catch (error) {
        // A collision of random keys is not expected: try a fresh key, and
        // let any other storage failure surface.
        if (attempt < 2 && this.isKeyCollision(error)) continue;
        throw error;
      }

      // The size and the checksum are those of the original file.
      return {
        storageKey: key,
        mimeType: input.mimeType,
        size: input.data.length,
        sha256: sha256Of(input.data),
        encryptionVersion,
      };
    }
  }

  // The whole file, decrypted when it is one of the encrypted ones. For the
  // small files of today (bounded by multer's limits and the generated PDFs).
  async getBuffer(reference: StorageReference): Promise<Buffer> {
    if (!isStorageKey(reference)) {
      return this.legacy.read(reference);
    }

    const stored = await this.adapter.read(reference);

    if (this.encryption.isEncryptedHeader(stored)) {
      if (!this.encryption.available || stored.length < FILE_HEADER_LENGTH) {
        throw fileIntegrityFailed();
      }

      try {
        return this.encryption.decrypt(stored, reference);
      } catch {
        // Wrong key, altered bytes: a controlled error, no detail to the
        // client.
        throw fileIntegrityFailed();
      }
    }

    return stored;
  }

  // The file, decrypted as it streams. The stream fails at its end when the
  // ciphertext was altered (the auth tag is checked there); a controller
  // that has already begun a download destroys the response instead of
  // ending a partial file.
  async getStream(reference: StorageReference): Promise<Readable> {
    if (!isStorageKey(reference)) {
      return this.legacy.open(reference);
    }

    const head = await this.adapter.readSlice(reference, FILE_HEADER_LENGTH);

    if (this.encryption.isEncryptedHeader(head)) {
      if (!this.encryption.available || head.length < FILE_HEADER_LENGTH) {
        // A header that is cut short cannot authenticate anything: nothing
        // of the file is sent (fail closed).
        throw fileIntegrityFailed();
      }

      const body = await this.adapter.open(reference, FILE_HEADER_LENGTH);
      let decipher: ReturnType<FileEncryption['createDecipher']>;
      try {
        decipher = this.encryption.createDecipher(head, reference);
      } catch {
        body.destroy();
        throw fileIntegrityFailed();
      }
      body.on('error', (error: Error) => decipher.destroy(error));

      return body.pipe(decipher);
    }

    // A file stored clear (a non-sensitive classification): the slice read
    // took its first bytes, they go first, then the rest of the stream.
    const passthrough = new PassThrough();
    passthrough.write(head);
    const body = await this.adapter.open(reference, head.length);
    body.on('error', (error: Error) => passthrough.destroy(error));
    body.pipe(passthrough);

    return passthrough;
  }

  async exists(reference: StorageReference): Promise<boolean> {
    if (!isStorageKey(reference)) {
      return this.legacy.exists(reference);
    }

    return this.adapter.exists(reference);
  }

  async delete(reference: StorageReference): Promise<void> {
    if (!isStorageKey(reference)) {
      return this.legacy.delete(reference);
    }

    return this.adapter.delete(reference);
  }

  // The objects of a group (the images of a volumetry) — a key prefix for
  // the modern storage, a folder for a legacy one.
  async deletePrefix(reference: StorageReference): Promise<void> {
    if (!isStorageKey(reference)) {
      return this.legacy.deleteFolder(reference);
    }

    return this.adapter.deletePrefix(reference);
  }

  private isKeyCollision(error: unknown): boolean {
    return error instanceof StorageKeyExistsError;
  }
}

export function sha256Of(data: Buffer): string {
  // The same checksum as the document rows already hold: of the original
  // file, never of the ciphertext.
  return createHash('sha256').update(data).digest('hex');
}

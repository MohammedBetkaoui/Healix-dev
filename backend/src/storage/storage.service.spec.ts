import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable } from 'node:stream';

import { LegacyFileReader } from './adapters/legacy-file.reader';
import { LocalEncryptedStorageAdapter } from './adapters/local-encrypted-storage.adapter';
import {
  createFileEncryption,
  FILE_ENCRYPTION_VERSION,
  FILE_HEADER_LENGTH,
  FILE_MAGIC,
} from './crypto/file-encryption.service';
import { StorageKeyExistsError } from './storage-errors';
import { StorageService } from './storage.service';
import { type StorageAdapter } from './storage.types';

let storageRoot: string;
let uploadRoot: string;
let adapter: LocalEncryptedStorageAdapter;
let legacy: LegacyFileReader;
let service: StorageService;

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), 'healix-storage-'));
  uploadRoot = await mkdtemp(join(tmpdir(), 'healix-uploads-'));

  adapter = new LocalEncryptedStorageAdapter(storageRoot);
  legacy = new LegacyFileReader(
    {
      get: (name: string) => (name === 'UPLOAD_ROOT' ? uploadRoot : undefined),
    } as unknown as ConfigService,
  );
  service = new StorageService(
    adapter,
    createFileEncryption(randomKey()),
    legacy,
  );
});

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true });
  await rm(uploadRoot, { recursive: true, force: true });
});

describe('StorageService.put', () => {
  it('stores a sensitive file encrypted on disk, and answers the metadata of the original', async () => {
    const data = Buffer.from('%PDF-1.7 a medical document');
    const stored = await service.put({
      data,
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
      originalFileName: 'ordonnance.pdf',
    });

    // The metadata of the original file, not of the ciphertext.
    expect(stored.size).toBe(data.length);
    expect(stored.encryptionVersion).toBe(FILE_ENCRYPTION_VERSION);
    expect(stored.mimeType).toBe('application/pdf');
    expect(stored.sha256).toHaveLength(64);
    expect(stored.storageKey).toMatch(/^hx\/medical\/[0-9a-f]{2}\/[0-9a-f]{32}\.bin$/);

    // The name of the file never appears on disk.
    expect(stored.storageKey).not.toContain('ordonnance');
    const onDisk = await readFile(join(adapter.rootPath, stored.storageKey));
    expect(onDisk.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)).toBe(true);
    expect(onDisk.indexOf(data)).toBe(-1);
    expect(onDisk.length).toBe(FILE_HEADER_LENGTH + data.length);
  });

  it('reads back what it stored: the plaintext, not the ciphertext', async () => {
    const data = Buffer.from('%PDF-1.7 verification piece');
    const stored = await service.put({
      data,
      classification: 'VERIFICATION_SENSITIVE',
      mimeType: 'image/png',
    });

    const restored = await service.getBuffer(stored.storageKey);
    expect(restored.equals(data)).toBe(true);
  });

  it('decrypts as it streams what it stored', async () => {
    const data = Buffer.concat([Buffer.from('%PDF-1.7 '), Buffer.alloc(64 * 1024, 3)]);
    const stored = await service.put({
      data,
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
    });

    expect((await collect(await service.getStream(stored.storageKey))).equals(data)).toBe(true);
  });

  it('stores a non-sensitive file clear (no encryption, version null)', async () => {
    const data = Buffer.from('a logo');
    const stored = await service.put({
      data,
      classification: 'PUBLIC',
      mimeType: 'image/png',
    });

    expect(stored.encryptionVersion).toBeNull();
    expect(await readFile(join(adapter.rootPath, stored.storageKey))).toEqual(data);
    expect((await service.getBuffer(stored.storageKey)).equals(data)).toBe(true);
  });

  it('refuses a sensitive write without a master key: fail closed', async () => {
    const withoutKey = new StorageService(
      adapter,
      createFileEncryption(null),
      legacy,
    );

    const caught = await withoutKey
      .put({
        data: Buffer.from('%PDF-1.7'),
        classification: 'MEDICAL_SENSITIVE',
        mimeType: 'application/pdf',
      })
      .catch((error: Error) => error);

    expect((caught as { response?: { code: string } }).response?.code).toBe(
      'STORAGE_NOT_CONFIGURED',
    );
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(500);
  });

  it('still stores a non-sensitive write without a master key', async () => {
    const withoutKey = new StorageService(
      adapter,
      createFileEncryption(null),
      legacy,
    );

    const stored = await withoutKey.put({
      data: Buffer.from('a public asset'),
      classification: 'PUBLIC',
      mimeType: 'image/png',
    });

    expect(stored.encryptionVersion).toBeNull();
  });

  it('refuses an empty file', async () => {
    await expect(
      service.put({
        data: Buffer.alloc(0),
        classification: 'MEDICAL_SENSITIVE',
        mimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ response: { code: 'FILE_EMPTY' } });
  });

  it('retries with a fresh key when a key collides, then gives up', async () => {
    const puts: string[] = [];
    const collidingAdapter: StorageAdapter = {
      put: async (key: string) => {
        puts.push(key);
        // Two collisions: the third attempt gets through.
        if (puts.length < 3) throw new StorageKeyExistsError();
      },
      read: async () => Buffer.alloc(0),
      open: async () => Buffer.alloc(0) as unknown as Readable,
      readSlice: async () => Buffer.alloc(0),
      delete: async () => undefined,
      deletePrefix: async () => undefined,
      exists: async () => true,
    };
    const serviceWithCollisions = new StorageService(
      collidingAdapter,
      createFileEncryption(null),
      legacy,
    );

    const stored = await serviceWithCollisions.put({
      data: Buffer.from('x'),
      classification: 'PRIVATE',
      mimeType: 'text/plain',
    });

    expect(puts).toHaveLength(3);
    expect(new Set(puts).size).toBe(3);
    expect(stored.storageKey).toBe(puts[2]);
  });

  it('surfaces the error after three collided attempts', async () => {
    const collidingAdapter: StorageAdapter = {
      put: async () => {
        throw new StorageKeyExistsError();
      },
      read: async () => Buffer.alloc(0),
      open: async () => Buffer.alloc(0) as unknown as Readable,
      readSlice: async () => Buffer.alloc(0),
      delete: async () => undefined,
      deletePrefix: async () => undefined,
      exists: async () => true,
    };
    const alwaysColliding = new StorageService(
      collidingAdapter,
      createFileEncryption(null),
      legacy,
    );

    await expect(
      alwaysColliding.put({
        data: Buffer.from('x'),
        classification: 'PRIVATE',
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow(StorageKeyExistsError);
  });
});

describe('StorageService on a corrupted file', () => {
  it('refuses a ciphertext whose bytes were altered (FILE_INTEGRITY_FAILED)', async () => {
    const data = Buffer.alloc(2048, 9);
    const stored = await service.put({
      data,
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
    });

    const path = join(adapter.rootPath, stored.storageKey);
    const ciphertext = await readFile(path);
    ciphertext[FILE_HEADER_LENGTH + 10] ^= 0x01;
    await writeFile(path, ciphertext);

    await expect(service.getBuffer(stored.storageKey)).rejects.toMatchObject({
      response: { code: 'FILE_INTEGRITY_FAILED' },
    });
  });

  it('fails the stream at its end when the bytes were altered', async () => {
    const data = Buffer.alloc(2048, 9);
    const stored = await service.put({
      data,
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
    });

    const path = join(adapter.rootPath, stored.storageKey);
    const ciphertext = await readFile(path);
    ciphertext[ciphertext.length - 1] ^= 0x01;
    await writeFile(path, ciphertext);

    await expect(collect(await service.getStream(stored.storageKey))).rejects.toThrow();
  });

  it('refuses a truncated encrypted file instead of streaming it clear', async () => {
    const stored = await service.put({
      data: Buffer.alloc(512, 4),
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
    });

    const path = join(adapter.rootPath, stored.storageKey);
    await writeFile(path, (await readFile(path)).subarray(0, 10));

    await expect(service.getBuffer(stored.storageKey)).rejects.toMatchObject({
      response: { code: 'FILE_INTEGRITY_FAILED' },
    });
    await expect(service.getStream(stored.storageKey)).rejects.toMatchObject({
      response: { code: 'FILE_INTEGRITY_FAILED' },
    });
  });

  it('answers FILE_NOT_FOUND for an unknown storage key', async () => {
    const caught = await service
      .getBuffer('hx/medical/ab/' + '0'.repeat(32) + '.bin')
      .catch((error: Error) => error);

    expect((caught as { response?: { code: string } }).response?.code).toBe(
      'FILE_NOT_FOUND',
    );
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(404);
  });
});

describe('StorageService during the legacy transition', () => {
  it('reads a legacy path from UPLOAD_ROOT through the LegacyFileReader', async () => {
    const directory = join(uploadRoot, 'verifications', 'request-1');
    await ensureDirectory(directory);
    const path = join(directory, 'card.pdf');
    await writeFile(path, Buffer.from('a legacy file'));

    expect((await service.getBuffer('verifications/request-1/card.pdf')).equals(Buffer.from('a legacy file'))).toBe(true);
    expect((await collect(await service.getStream('verifications/request-1/card.pdf'))).equals(Buffer.from('a legacy file'))).toBe(true);
    expect(await service.exists('verifications/request-1/card.pdf')).toBe(true);
    expect(await service.exists('verifications/request-1/other.pdf')).toBe(false);
  });

  it('answers FILE_NOT_FOUND for a legacy path that escapes UPLOAD_ROOT', async () => {
    await expect(service.getBuffer('../../etc/passwd')).rejects.toMatchObject({
      response: { code: 'FILE_NOT_FOUND' },
    });
  });

  it('deletes through the same discriminator (a key, or a legacy folder)', async () => {
    const data = Buffer.from('x');
    const stored = await service.put({
      data,
      classification: 'MEDICAL_SENSITIVE',
      mimeType: 'application/pdf',
    });

    await service.delete(stored.storageKey);
    expect(existsSync(join(adapter.rootPath, stored.storageKey))).toBe(false);

    const directory = join(uploadRoot, 'patients', 'p-1');
    await ensureDirectory(directory);
    await writeFile(join(directory, 'doc.pdf'), Buffer.from('legacy'));
    await service.delete('patients/p-1/doc.pdf');
    expect(existsSync(join(directory, 'doc.pdf'))).toBe(false);
  });

  it('removes a legacy folder (a volumetry) entirely', async () => {
    const directory = join(uploadRoot, 'patients', 'p-2', 'volumetry');
    await ensureDirectory(directory);
    await writeFile(join(directory, 'slice-ed-001.png'), Buffer.from('a'));
    await writeFile(join(directory, 'slice-es-001.png'), Buffer.from('b'));

    await service.deletePrefix('patients/p-2/volumetry');

    expect(existsSync(directory)).toBe(false);
  });
});

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

function randomKey(): Buffer {
  // A fresh master key per test: no cross-test decrypt could ever succeed by
  // accident.
  return randomBytes(32);
}

async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { LegacyFileReader } from '../../storage/adapters/legacy-file.reader';
import { LocalEncryptedStorageAdapter } from '../../storage/adapters/local-encrypted-storage.adapter';
import {
  createFileEncryption,
  FILE_MAGIC,
} from '../../storage/crypto/file-encryption.service';
import { StorageService } from '../../storage/storage.service';
import { VerificationFileStorageService } from './verification-file-storage.service';

let storageRoot: string;
let uploadRoot: string;
let storageService: StorageService;
let service: VerificationFileStorageService;

const jpeg = (bytes = 256): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(bytes)]);

const fileOf = (
  buffer: Buffer,
  name = 'carte-identite.jpg',
): Express.Multer.File =>
  ({
    buffer,
    mimetype: 'image/jpeg',
    originalname: name,
    size: buffer.length,
  }) as Express.Multer.File;

const newStorage = (masterKey: Buffer | null): StorageService => {
  const configService = {
    get: (name: string) => (name === 'UPLOAD_ROOT' ? uploadRoot : undefined),
  } as unknown as ConfigService;

  return new StorageService(
    new LocalEncryptedStorageAdapter(storageRoot),
    createFileEncryption(masterKey),
    new LegacyFileReader(configService),
  );
};

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), 'healix-verification-'));
  uploadRoot = await mkdtemp(join(tmpdir(), 'healix-uploads-'));

  // The master key the environment would provide in the development.
  storageService = newStorage(randomBytes(32));
  service = new VerificationFileStorageService(storageService);
});

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true });
  await rm(uploadRoot, { recursive: true, force: true });
});

describe('VerificationFileStorageService.storeVerificationFile', () => {
  it('stores the file encrypted under an opaque key, and answers its metadata', async () => {
    const image = jpeg();

    const stored = await service.storeVerificationFile({
      documentType: 'ID_CARD',
      extension: '.jpg',
      file: fileOf(image, 'carte identite .jpg'),
      ownerId: 'profile-1',
      ownerType: 'doctors',
      verificationRequestId: 'request-1',
    });

    // The metadata the row keeps: the key of the file (opaque), the version
    // of the format it was written with, the checksum of the original, and
    // the two names (the one shown, the one stored).
    expect(stored.storageKey).toMatch(
      /^hx\/verification\/[0-9a-f]{2}\/[0-9a-f]{32}\.bin$/,
    );
    expect(stored.encryptionVersion).toBe(1);
    expect(stored.originalName).toBe('carte identite .jpg');
    expect(stored.storedName).toMatch(/^ID_CARD_\d+_[0-9a-f]{12}\.jpg$/);
    expect(stored.checksum).toHaveLength(64);

    // On disk: the ciphertext of the file format (HXE magic), never the
    // plaintext, and nothing that carries a name or an id (the folders of
    // the key are two hex segments and a hash).
    const onDisk = await readFile(join(storageRoot, stored.storageKey));
    expect(onDisk.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)).toBe(true);
    expect(onDisk.indexOf(image)).toBe(-1);
    expect(existsSync(join(storageRoot, 'verifications'))).toBe(false);
  });

  it('round-trips through the storage: the plaintext comes back for the row', async () => {
    const pdf = Buffer.from('%PDF-1.7 attestation');
    const stored = await service.storeVerificationFile({
      documentType: 'LICENSE',
      extension: '.pdf',
      file: fileOf(pdf, 'attestation.pdf'),
      ownerId: 'profile-1',
      ownerType: 'doctors',
      verificationRequestId: 'request-1',
    });

    expect(
      (await storageService.getBuffer(stored.storageKey)).equals(pdf),
    ).toBe(true);
  });

  it('propagates the controlled errors of the storage (a refused write without a key)', async () => {
    // A storage without a master key: the sensitive write is refused, the
    // file is never kept in clear text.
    const refusing = new VerificationFileStorageService(newStorage(null));

    await expect(
      refusing.storeVerificationFile({
        documentType: 'ID_CARD',
        extension: '.jpg',
        file: fileOf(jpeg(16)),
        ownerId: 'profile-1',
        ownerType: 'doctors',
        verificationRequestId: 'request-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORAGE_NOT_CONFIGURED' } });

    // Nothing was left on disk, not even clear.
    expect(existsSync(join(storageRoot, 'hx'))).toBe(false);
  });
});

describe('VerificationFileStorageService.deleteFile', () => {
  it('removes a modern key from the storage', async () => {
    const stored = await service.storeVerificationFile({
      documentType: 'ID_CARD',
      extension: '.jpg',
      file: fileOf(jpeg(16)),
      ownerId: 'profile-1',
      ownerType: 'doctors',
      verificationRequestId: 'request-1',
    });

    await service.deleteFile(stored.storageKey);

    await expect(storageService.exists(stored.storageKey)).resolves.toBe(false);
  });

  it('removes a legacy path under UPLOAD_ROOT (the transition)', async () => {
    const directory = join(uploadRoot, 'verifications', 'request-1');
    await mkdir(directory, { recursive: true });
    const legacyPath = join(directory, 'old-card.jpg');
    await writeFile(legacyPath, Buffer.from('legacy'));

    await service.deleteFile(legacyPath);

    expect(existsSync(legacyPath)).toBe(false);
  });

  it('warns instead of failing when the file is already gone (a row without its file)', async () => {
    await expect(
      service.deleteFile('hx/verification/ab/' + '0'.repeat(32) + '.bin'),
    ).resolves.toBeUndefined();
  });
});

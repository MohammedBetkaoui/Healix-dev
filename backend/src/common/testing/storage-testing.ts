import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LegacyFileReader } from '../../storage/adapters/legacy-file.reader';
import { LocalEncryptedStorageAdapter } from '../../storage/adapters/local-encrypted-storage.adapter';
import { createFileEncryption } from '../../storage/crypto/file-encryption.service';
import { StorageService } from '../../storage/storage.service';

// The storage the unit specs use when they exercise a service that holds a
// PatientFileStorageService (or another storage-backed service) in its hand:
// a real StorageService, over a throwaway folder, without a master key —
// the legacy paths of the specs (under UPLOAD_ROOT) are read and deleted
// through the legacy branch, and a modern write of the code under test is
// refused the way the development would refuse it.
export function testStorageService(configService: ConfigService): StorageService {
  const root = mkdtempSync(join(tmpdir(), 'healix-storage-unit-'));

  // Removed when the process of the spec ends: a temp folder, nothing that
  // survives a run.
  process.on('exit', () => rmSync(root, { force: true, recursive: true }));

  return new StorageService(
    new LocalEncryptedStorageAdapter(root),
    createFileEncryption(null),
    new LegacyFileReader(configService),
  );
}

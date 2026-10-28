import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LegacyFileReader } from './adapters/legacy-file.reader';
import { LocalEncryptedStorageAdapter } from './adapters/local-encrypted-storage.adapter';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { createFileEncryption } from './crypto/file-encryption.service';
import { storageConfig, type StorageConfig } from './storage.config';
import {
  STORAGE_ADAPTER,
  STORAGE_ENCRYPTION,
  StorageService,
} from './storage.service';
import { type StorageAdapter } from './storage.types';

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

// The one storage module of the application. Global: the business modules
// inject StorageService (the only public door) without importing this module
// everywhere; the adapters and the encryption are assembled here from the
// environment, read and validated once (invalid values, and a missing
// STORAGE_MASTER_KEY in production, stop the backend at startup).
@Global()
@Module({
  providers: [
    LegacyFileReader,
    {
      provide: STORAGE_CONFIG,
      useFactory: (configService: ConfigService) => storageConfig(configService),
      inject: [ConfigService],
    },
    {
      provide: STORAGE_ENCRYPTION,
      useFactory: (config: StorageConfig) => {
        if (!config.masterKey) {
          // Development only (production would not be here: the
          // configuration failed closed at startup). The sensitive writes
          // are refused when they happen, not warned about forever.
          new Logger(StorageModule.name).warn(
            'STORAGE_MASTER_KEY is not set: the sensitive files are refused (STORAGE_NOT_CONFIGURED) until a key is configured.',
          );
        }

        return createFileEncryption(config.masterKey);
      },
      inject: [STORAGE_CONFIG],
    },
    {
      provide: STORAGE_ADAPTER,
      useFactory: (config: StorageConfig): StorageAdapter => {
        if (config.driver === 's3') {
          return new S3StorageAdapter(config.s3!);
        }

        return new LocalEncryptedStorageAdapter(config.localRoot);
      },
      inject: [STORAGE_CONFIG],
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_ADAPTER, STORAGE_ENCRYPTION],
})
export class StorageModule {}

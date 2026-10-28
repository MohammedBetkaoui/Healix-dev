import { randomBytes } from 'node:crypto';

import {
  DEFAULT_STORAGE_LOCAL_ROOT,
  readStorageConfig,
  StorageConfigError,
} from './storage.config';

const dev = { NODE_ENV: 'development' } as Record<string, string | undefined>;

describe('readStorageConfig', () => {
  it('works out of the box: local driver, its default root, no key in development', () => {
    const config = readStorageConfig(dev);

    expect(config.driver).toBe('local');
    expect(config.localRoot).toBe(DEFAULT_STORAGE_LOCAL_ROOT);
    expect(config.masterKey).toBeNull();
    expect(config.s3).toBeNull();
  });

  it('reads the local root and the driver that are configured', () => {
    const config = readStorageConfig({
      ...dev,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: '/data/healix/storage',
    });

    expect(config.driver).toBe('local');
    expect(config.localRoot).toBe('/data/healix/storage');
  });

  it('refuses a driver it does not know', () => {
    expect(() => readStorageConfig({ ...dev, STORAGE_DRIVER: 'ftp' })).toThrow(
      StorageConfigError,
    );
  });

  it('requires the settings of the bucket when the driver is s3', () => {
    expect(() => readStorageConfig({ ...dev, STORAGE_DRIVER: 's3' })).toThrow(
      StorageConfigError,
    );
    expect(() =>
      readStorageConfig({
        ...dev,
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'healix',
        S3_ACCESS_KEY_ID: 'a',
        S3_SECRET_ACCESS_KEY: 's',
      }),
    ).not.toThrow();
  });

  it('reads the S3 settings, with path-style addressing by default (MinIO, R2)', () => {
    const config = readStorageConfig({
      ...dev,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio:9000',
      S3_REGION: 'eu-west-3',
      S3_BUCKET: 'healix-prod',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 's',
    });

    expect(config.s3).toEqual({
      endpoint: 'http://minio:9000',
      region: 'eu-west-3',
      bucket: 'healix-prod',
      accessKeyId: 'a',
      secretAccessKey: 's',
      forcePathStyle: true,
    });
  });

  it('reads S3_FORCE_PATH_STYLE=false for the AWS virtual-host addressing', () => {
    const config = readStorageConfig({
      ...dev,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'healix-prod',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 's',
      S3_FORCE_PATH_STYLE: 'false',
    });

    expect(config.s3!.forcePathStyle).toBe(false);
    expect(() =>
      readStorageConfig({
        ...dev,
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'a',
        S3_SECRET_ACCESS_KEY: 's',
        S3_FORCE_PATH_STYLE: 'maybe',
      }),
    ).toThrow(StorageConfigError);
  });

  it('reads a valid master key', () => {
    const key = randomBytes(32);
    const config = readStorageConfig({
      ...dev,
      STORAGE_MASTER_KEY: key.toString('base64'),
    });

    expect(config.masterKey!.equals(key)).toBe(true);
  });

  it('refuses an invalid master key, in the development too', () => {
    expect(() =>
      readStorageConfig({ ...dev, STORAGE_MASTER_KEY: 'too-short' }),
    ).toThrow(StorageConfigError);
    expect(() =>
      readStorageConfig({
        ...dev,
        STORAGE_MASTER_KEY: randomBytes(16).toString('base64'),
      }),
    ).toThrow(StorageConfigError);
  });

  it('fails closed in production: no master key, no backend', () => {
    expect(() =>
      readStorageConfig({ NODE_ENV: 'production' } as Record<
        string,
        string | undefined
      >),
    ).toThrow(StorageConfigError);

    const production = readStorageConfig({
      NODE_ENV: 'production',
      STORAGE_MASTER_KEY: randomBytes(32).toString('base64'),
    } as Record<string, string | undefined>);

    expect(production.masterKey).toHaveLength(32);
  });
});

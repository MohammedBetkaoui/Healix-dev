import { type ConfigService } from '@nestjs/config';

import { parseStorageMasterKey } from './crypto/file-encryption.service';

// How the files are stored: a driver (`local` for the development and the
// single-server deployments, `s3` for an S3-compatible object store), the
// folder of the local driver, the settings of the S3 one, and the master key
// of the encryption (STORAGE_MASTER_KEY, base64 of exactly 32 bytes, provided
// through the environment or the secret store: never in the code, the Git
// history or the database).
//
// The configuration is read and validated once, at startup: an invalid value
// stops the backend (like the JWT secrets and the Orthanc credentials), a
// missing master key in production too (fail closed — no sensitive file is
// ever written in clear text because a variable was forgotten), while the
// development only logs a warning and refuses the sensitive writes at the
// moment they would happen (STORAGE_NOT_CONFIGURED).
type Env = Record<string, string | undefined>;

export type StorageDriver = 'local' | 's3';

export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type StorageConfig = {
  driver: StorageDriver;
  // The root of the local driver (STORAGE_LOCAL_ROOT). Served by nothing:
  // outside the web roots, outside UPLOAD_ROOT.
  localRoot: string;
  // The master key of the encryption, or null while it is not set (the
  // development). Never logged, never stored anywhere else.
  masterKey: Buffer | null;
  s3: S3StorageConfig | null;
};

export class StorageConfigError extends Error {}

export const DEFAULT_STORAGE_LOCAL_ROOT = './storage-private';
export const DEFAULT_S3_REGION = 'us-east-1';

function readBoolean(raw: string | undefined, name: string): boolean {
  const value = raw?.trim().toLowerCase();

  if (value === undefined || value === '') return true; // default below
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new StorageConfigError(`${name} doit valoir true ou false.`);
}

// The settings of the environment. `driver` may stay empty: it means `local`,
// the driver that works out of the box. Choosing `s3` requires the settings
// of the bucket (in the development too: there is no usable half-choice). The
// master key is parsed by the encryption (a value that is not the base64 of
// 32 bytes throws, at startup).
export function readStorageConfig(env: Env): StorageConfig {
  const production = env.NODE_ENV === 'production';

  const driverName = env.STORAGE_DRIVER?.trim();
  let driver: StorageDriver;

  if (driverName === undefined || driverName === '') {
    driver = 'local';
  } else if (driverName === 'local' || driverName === 's3') {
    driver = driverName;
  } else {
    throw new StorageConfigError(
      `STORAGE_DRIVER doit valoir local ou s3 (valeur actuelle : ${driverName}).`,
    );
  }

  let masterKey: Buffer | null = null;

  try {
    masterKey = parseStorageMasterKey(env.STORAGE_MASTER_KEY);
  } catch {
    // Re-thrown as it is: the message of the key says what is wrong, without
    // echoing the value itself.
    throw new StorageConfigError(
      'STORAGE_MASTER_KEY doit être la base64 des 32 octets d’une clé aléatoire (par exemple : openssl rand -base64 32).',
    );
  }

  if (masterKey === null && production) {
    throw new StorageConfigError(
      'STORAGE_MASTER_KEY manque : en production, définissez une clé aléatoire de 32 octets (par exemple : openssl rand -base64 32), sans laquelle aucun fichier sensible n’est stocké.',
    );
  }

  const localRoot = env.STORAGE_LOCAL_ROOT?.trim() || DEFAULT_STORAGE_LOCAL_ROOT;

  let s3: S3StorageConfig | null = null;

  if (driver === 's3') {
    const bucket = env.S3_BUCKET?.trim();
    const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();

    if (!bucket) {
      throw new StorageConfigError(
        'S3_BUCKET manque : STORAGE_DRIVER=s3 requiert le nom du seau.',
      );
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new StorageConfigError(
        'S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY manquent : STORAGE_DRIVER=s3 requiert les identifiants du seau.',
      );
    }

    s3 = {
      endpoint: env.S3_ENDPOINT?.trim() || undefined,
      region: env.S3_REGION?.trim() || DEFAULT_S3_REGION,
      bucket,
      accessKeyId,
      secretAccessKey,
      // MinIO, R2 and the self-hosted endpoints address buckets by path;
      // S3_FORCE_PATH_STYLE=false is the AWS virtual-host addressing.
      forcePathStyle: readBoolean(env.S3_FORCE_PATH_STYLE, 'S3_FORCE_PATH_STYLE'),
    };
  }

  return { driver, localRoot, masterKey, s3 };
}

const STORAGE_ENV_NAMES = [
  'NODE_ENV',
  'S3_ACCESS_KEY_ID',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
  'S3_REGION',
  'S3_SECRET_ACCESS_KEY',
  'STORAGE_DRIVER',
  'STORAGE_LOCAL_ROOT',
  'STORAGE_MASTER_KEY',
] as const;

export function storageConfig(configService: ConfigService): StorageConfig {
  return readStorageConfig(
    Object.fromEntries(
      STORAGE_ENV_NAMES.map((name) => [name, configService.get<string>(name)]),
    ),
  );
}

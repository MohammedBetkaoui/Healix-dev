// Encryption at rest of the sensitive files: AES-256-GCM, a random 12-byte IV
// per file, the storage key authenticated as associated data (a ciphertext
// moved under another key does not decrypt), the authentication tag checked
// at each read. The file format is versioned so that a future rotation or
// migration can tell the versions apart:
//
//   'HXE' (3 bytes) | version (1 byte) | IV (12 bytes) | tag (16 bytes) | ciphertext
//
// The master key comes from STORAGE_MASTER_KEY (base64 of exactly 32 bytes)
// through the environment or the secret store: never in the database, the
// Git history, the source or the encrypted files themselves. Without a valid
// key, a sensitive file is refused, never written in clear text (fail
// closed). No error message or log line ever contains key material.
//
// One key today (encryptionVersion = 1). The version field is what a future
// envelope/KMS setup would build on; a key registry per version would come
// with the first rotation.

import {
  createCipheriv,
  createDecipheriv,
  type DecipherGCM,
  randomBytes,
} from 'node:crypto';

export const FILE_MAGIC = Buffer.from('HXE', 'ascii');
export const FILE_ENCRYPTION_VERSION = 1;
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
// magic + version + IV + tag: the bytes that come before the ciphertext.
export const FILE_HEADER_LENGTH =
  FILE_MAGIC.length + 1 + IV_LENGTH + TAG_LENGTH;
const KEY_LENGTH = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const ALGORITHM = 'aes-256-gcm';

export class StorageMasterKeyError extends Error {
  constructor(reason: string) {
    super(`STORAGE_MASTER_KEY ${reason}`);
    this.name = 'StorageMasterKeyError';
  }
}

// Wrong key, altered bytes, truncated file, ciphertext of another file: the
// read fails, the caller answers a controlled 500 (FILE_INTEGRITY_FAILED).
export class FileDecryptionError extends Error {
  constructor() {
    super('Encrypted file could not be decrypted.');
    this.name = 'FileDecryptionError';
  }
}

// The master key of the deployment, or null while it is not configured
// (development without one: the sensitive writes fail closed).
export type FileEncryption = {
  // True when a master key is configured: the sensitive writes fail closed
  // when it is false.
  readonly available: boolean;
  encrypt(plaintext: Buffer, storageKey: string): { data: Buffer; version: number };
  decrypt(stored: Buffer, storageKey: string): Buffer;
  // A decipher for the ciphertext that follows the 32-byte header, so a
  // large file is decrypted as it streams; it fails at its end when the
  // bytes were altered or the key is wrong.
  createDecipher(header: Buffer, storageKey: string): DecipherGCM;
  isEncryptedHeader(header: Buffer): boolean;
};

function assertHeaderLength(header: Buffer): void {
  if (header.length !== FILE_HEADER_LENGTH) {
    throw new FileDecryptionError();
  }
}

function decipherOf(
  key: Buffer,
  header: Buffer,
  storageKey: string,
): DecipherGCM {
  assertHeaderLength(header);

  if (
    !header.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC) ||
    header[FILE_MAGIC.length] !== FILE_ENCRYPTION_VERSION
  ) {
    throw new FileDecryptionError();
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      header.subarray(
        FILE_MAGIC.length + 1,
        FILE_MAGIC.length + 1 + IV_LENGTH,
      ),
      { authTagLength: TAG_LENGTH },
    );
    decipher.setAAD(Buffer.from(storageKey, 'utf8'));
    decipher.setAuthTag(
      header.subarray(
        FILE_MAGIC.length + 1 + IV_LENGTH,
        FILE_HEADER_LENGTH,
      ),
    );
    return decipher;
  } catch {
    throw new FileDecryptionError();
  }
}

export function createFileEncryption(masterKey: Buffer | null): FileEncryption {
  return {
    available: masterKey !== null,

    encrypt(plaintext, storageKey) {
      if (!masterKey) {
        // Fail closed: the file is not stored in clear text.
        throw new FileDecryptionError();
      }

      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, masterKey, iv, {
        authTagLength: TAG_LENGTH,
      });
      cipher.setAAD(Buffer.from(storageKey, 'utf8'));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);

      return {
        data: Buffer.concat([
          FILE_MAGIC,
          Buffer.from([FILE_ENCRYPTION_VERSION]),
          iv,
          cipher.getAuthTag(),
          ciphertext,
        ]),
        version: FILE_ENCRYPTION_VERSION,
      };
    },

    decrypt(stored, storageKey) {
      if (!masterKey) throw new FileDecryptionError();
      if (stored.length < FILE_HEADER_LENGTH) throw new FileDecryptionError();

      try {
        const decipher = decipherOf(
          masterKey,
          stored.subarray(0, FILE_HEADER_LENGTH),
          storageKey,
        );
        return Buffer.concat([
          decipher.update(stored.subarray(FILE_HEADER_LENGTH)),
          decipher.final(),
        ]);
      } catch (error) {
        if (error instanceof FileDecryptionError) throw error;
        throw new FileDecryptionError();
      }
    },

    createDecipher(header, storageKey) {
      if (!masterKey) throw new FileDecryptionError();
      return decipherOf(masterKey, header, storageKey);
    },

    isEncryptedHeader(header) {
      // The magic only: a truncated ciphertext must still be recognized as
      // an encrypted file (and refused), never streamed out as if it were
      // clear bytes.
      return (
        header.length >= FILE_MAGIC.length &&
        header.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)
      );
    },
  };
}

// STORAGE_MASTER_KEY: base64 of exactly 32 bytes (openssl rand -base64 32).
// Returns null when it is not set — the caller decides whether that is
// allowed — and throws on a value that cannot be a key.
export function parseStorageMasterKey(
  value: string | undefined,
): Buffer | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const encoded = value.trim();

  if (!BASE64_PATTERN.test(encoded)) {
    throw new StorageMasterKeyError(
      'doit être la base64 des 32 octets de la clé (openssl rand -base64 32).',
    );
  }

  const key = Buffer.from(encoded, 'base64');

  if (key.length !== KEY_LENGTH || key.toString('base64') !== encoded) {
    throw new StorageMasterKeyError(
      'doit faire exactement 32 octets, en base64 (openssl rand -base64 32).',
    );
  }

  return key;
}

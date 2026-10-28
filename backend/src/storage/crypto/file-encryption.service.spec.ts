import { randomBytes } from 'node:crypto';

import {
  createFileEncryption,
  FILE_ENCRYPTION_VERSION,
  FILE_HEADER_LENGTH,
  FILE_MAGIC,
  FileDecryptionError,
  IV_LENGTH,
  parseStorageMasterKey,
  StorageMasterKeyError,
  TAG_LENGTH,
} from './file-encryption.service';

const KEY = randomBytes(32);

// A short text, and a content longer than one cipher block, to leave no doubt
// about a partial decryption.
const plaintext = (bytes = 500) => randomBytes(bytes);

describe('the file encryption', () => {
  it('encrypts and decrypts, with the same storage key, into the original bytes', () => {
    const encryption = createFileEncryption(KEY);
    const data = plaintext();
    const reference = 'hx/medical/ab/' + 'a'.repeat(32) + '.bin';

    const stored = encryption.encrypt(data, reference);
    const restored = encryption.decrypt(stored.data, reference);

    expect(restored.equals(data)).toBe(true);
  });

  it('writes a versioned format: magic, version, IV, tag, ciphertext', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + 'b'.repeat(32) + '.bin';
    const stored = encryption.encrypt(Buffer.from('hello'), reference);

    expect(stored.version).toBe(FILE_ENCRYPTION_VERSION);
    expect(stored.data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)).toBe(
      true,
    );
    expect(stored.data[FILE_MAGIC.length]).toBe(FILE_ENCRYPTION_VERSION);
    expect(stored.data.length).toBe(
      FILE_HEADER_LENGTH + Buffer.from('hello').length,
    );
  });

  it('uses a random IV: the same file encrypted twice never produces the same ciphertext', () => {
    const encryption = createFileEncryption(KEY);
    const data = plaintext();
    const reference = 'hx/medical/ab/' + 'c'.repeat(32) + '.bin';

    const first = encryption.encrypt(data, reference);
    const second = encryption.encrypt(data, reference);

    expect(first.version).toBe(second.version);
    expect(
      first.data.subarray(0, FILE_MAGIC.length + 1 + IV_LENGTH).equals(
        second.data.subarray(0, FILE_MAGIC.length + 1 + IV_LENGTH),
      ),
    ).toBe(false);
    expect(first.data.equals(second.data)).toBe(false);
  });

  it('refuses a file whose ciphertext was altered', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + 'd'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(), reference);

    const altered = Buffer.from(stored.data);
    altered[FILE_HEADER_LENGTH] ^= 0x01;

    expect(() => encryption.decrypt(altered, reference)).toThrow(
      FileDecryptionError,
    );
  });

  it('refuses a file whose authentication tag was altered', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + 'e'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(), reference);

    const altered = Buffer.from(stored.data);
    // The tag sits just before the ciphertext.
    altered[FILE_HEADER_LENGTH - TAG_LENGTH] ^= 0xff;

    expect(() => encryption.decrypt(altered, reference)).toThrow(
      FileDecryptionError,
    );
  });

  it('refuses a file decrypted with the wrong master key', () => {
    const reference = 'hx/medical/ab/' + 'f'.repeat(32) + '.bin';
    const stored = createFileEncryption(KEY).encrypt(plaintext(), reference);

    expect(() =>
      createFileEncryption(randomBytes(32)).decrypt(stored.data, reference),
    ).toThrow(FileDecryptionError);
  });

  it('refuses a ciphertext that was moved under another storage key (the key authenticates the reference)', () => {
    const encryption = createFileEncryption(KEY);
    const stored = encryption.encrypt(
      plaintext(),
      'hx/medical/ab/' + '1'.repeat(32) + '.bin',
    );

    expect(() =>
      encryption.decrypt(stored.data, 'hx/medical/cd/' + '2'.repeat(32) + '.bin'),
    ).toThrow(FileDecryptionError);
  });

  it('refuses a truncated file, a truncated header and an unknown version', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + '3'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(), reference);

    // Header alone, and header cut short: nothing decryptable.
    expect(() =>
      encryption.decrypt(stored.data.subarray(0, FILE_HEADER_LENGTH), reference),
    ).toThrow(FileDecryptionError);
    expect(() =>
      encryption.decrypt(stored.data.subarray(0, 10), reference),
    ).toThrow(FileDecryptionError);

    // A header of another version of the format is not readable by this one.
    const otherVersion = Buffer.from(stored.data);
    otherVersion[FILE_MAGIC.length] = 0x02;
    expect(() => encryption.decrypt(otherVersion, reference)).toThrow(
      FileDecryptionError,
    );
  });

  it('never decrypts without a master key (fail closed)', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + '4'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(), reference);

    const withoutKey = createFileEncryption(null);

    expect(() => withoutKey.decrypt(stored.data, reference)).toThrow(
      FileDecryptionError,
    );
    expect(() =>
      withoutKey.encrypt(plaintext(), reference),
    ).toThrow(FileDecryptionError);
    expect(() =>
      withoutKey.createDecipher(
        stored.data.subarray(0, FILE_HEADER_LENGTH),
        reference,
      ),
    ).toThrow(FileDecryptionError);
  });

  it('recognizes an encrypted header from its magic alone, so a truncated ciphertext is refused, never streamed clear', () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + '5'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(), reference);

    expect(
      encryption.isEncryptedHeader(stored.data.subarray(0, 3)),
    ).toBe(true);
    expect(encryption.isEncryptedHeader(Buffer.from('%P'))).toBe(false);
    expect(encryption.isEncryptedHeader(Buffer.alloc(0))).toBe(false);
  });

  it('decrypts a large file through the decipher it hands to the stream', async () => {
    const encryption = createFileEncryption(KEY);
    const data = randomBytes(64 * 1024 + 7);
    const reference = 'hx/medical/ab/' + '6'.repeat(32) + '.bin';
    const stored = encryption.encrypt(data, reference);

    const decipher = encryption.createDecipher(
      stored.data.subarray(0, FILE_HEADER_LENGTH),
      reference,
    );
    decipher.end(stored.data.subarray(FILE_HEADER_LENGTH));

    const restored: Buffer[] = [];
    for await (const chunk of decipher) {
      restored.push(chunk as Buffer);
    }

    expect(Buffer.concat(restored).equals(data)).toBe(true);
  });

  it('fails at the end of the streamed decipher when the bytes were altered', async () => {
    const encryption = createFileEncryption(KEY);
    const reference = 'hx/medical/ab/' + '7'.repeat(32) + '.bin';
    const stored = encryption.encrypt(plaintext(4096), reference);

    const altered = Buffer.from(stored.data);
    altered[stored.data.length - 1] ^= 0x10;

    const decipher = encryption.createDecipher(
      altered.subarray(0, FILE_HEADER_LENGTH),
      reference,
    );
    decipher.end(altered.subarray(FILE_HEADER_LENGTH));

    await expect(async () => {
      for await (const chunk of decipher) {
        void chunk;
      }
    }).rejects.toThrow();
  });
});

describe('parseStorageMasterKey', () => {
  it('answers null when the key is simply absent (development)', () => {
    expect(parseStorageMasterKey(undefined)).toBeNull();
    expect(parseStorageMasterKey('')).toBeNull();
    expect(parseStorageMasterKey('   ')).toBeNull();
  });

  it('reads a valid base64 of 32 bytes', () => {
    const key = randomBytes(32);

    expect(parseStorageMasterKey(key.toString('base64'))!.equals(key)).toBe(
      true,
    );
  });

  it.each([
    ['31 bytes', randomBytes(31).toString('base64')],
    ['33 bytes', randomBytes(33).toString('base64')],
    ['not base64', 'not a base64 value!!'],
  ])('refuses %s', (_case, value) => {
    expect(() => parseStorageMasterKey(value)).toThrow(StorageMasterKeyError);
  });

  it('refuses a base64 that is not canonical (it would hide a different key)', () => {
    const key = randomBytes(32);
    const unpadded = key.toString('base64').replace(/=+$/, '');

    expect(() => parseStorageMasterKey(unpadded)).toThrow(
      StorageMasterKeyError,
    );
  });

  it('never puts key material in its errors', () => {
    const secret = randomBytes(31).toString('base64');
    let message = '';

    try {
      parseStorageMasterKey(secret);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/^STORAGE_MASTER_KEY/);
    expect(message).not.toContain(secret);
  });
});

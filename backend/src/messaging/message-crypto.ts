// Application-level encryption of message bodies at rest: AES-256-GCM, a new
// random 12-byte IV per body, stored as iv || tag || ciphertext next to the id
// of the key that encrypted it. A leaked database or backup does not reveal
// the messages without MESSAGING_KEYS, which is backed up separately.
//
// MESSAGING_KEYS="k1:<base64 of 32 bytes>,k2:<...>": the last key encrypts,
// all of them decrypt, so a new key is added at the end and the old ones stay
// as long as a message uses them. A missing or invalid value stops the
// backend at startup; no error message ever contains key material.

import {
  createCipheriv,
  createDecipheriv,
  type DecipherGCM,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
// The start of an encrypted file: iv || tag, the ciphertext after it.
export const FILE_HEADER_LENGTH = IV_LENGTH + TAG_LENGTH;
const KEY_LENGTH = 32;
// Fits messages.key_id (VARCHAR(16)).
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class MessagingKeysError extends Error {
  constructor(reason: string) {
    super(`MESSAGING_KEYS ${reason}`);
    this.name = 'MessagingKeysError';
  }
}

// A body that cannot be read: unknown key, altered data, other conversation.
export class MessageDecryptionError extends Error {
  constructor() {
    super('Message body could not be decrypted.');
    this.name = 'MessageDecryptionError';
  }
}

export type EncryptedBody = {
  // Its own ArrayBuffer, as Prisma's Bytes fields expect.
  ciphertext: Uint8Array<ArrayBuffer>;
  keyId: string;
};

export type MessagingKeys = {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
};

export function parseMessagingKeys(value: string | undefined): MessagingKeys {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new MessagingKeysError(
      'est absente : générez une clé avec « openssl rand -base64 32 » (voir DEPLOIEMENT.md).',
    );
  }

  const keys = new Map<string, Buffer>();

  entries.forEach((entry, index) => {
    const separator = entry.indexOf(':');
    const keyId = separator > 0 ? entry.slice(0, separator).trim() : '';
    const encoded = separator > 0 ? entry.slice(separator + 1).trim() : '';
    const position = `n° ${index + 1}`;

    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new MessagingKeysError(
        `: la clé ${position} doit s'écrire <identifiant>:<base64>, identifiant de 1 à 16 lettres, chiffres, - ou _.`,
      );
    }

    if (keys.has(keyId)) {
      throw new MessagingKeysError(
        `: l'identifiant « ${keyId} » est utilisé deux fois.`,
      );
    }

    const key = BASE64_PATTERN.test(encoded)
      ? Buffer.from(encoded, 'base64')
      : Buffer.alloc(0);

    if (key.length !== KEY_LENGTH || key.toString('base64') !== encoded) {
      throw new MessagingKeysError(
        `: la clé « ${keyId} » doit faire exactement 32 octets, en base64 (openssl rand -base64 32).`,
      );
    }

    keys.set(keyId, key);
  });

  return { currentKeyId: [...keys.keys()].at(-1) as string, keys };
}

export class MessageCrypto {
  private constructor(private readonly messagingKeys: MessagingKeys) {}

  static fromEnv(value: string | undefined): MessageCrypto {
    return new MessageCrypto(parseMessagingKeys(value));
  }

  get currentKeyId(): string {
    return this.messagingKeys.currentKeyId;
  }

  // The context (the conversation id) is authenticated with the body: a
  // ciphertext copied into another conversation does not decrypt.
  encrypt(plaintext: string, context: string): EncryptedBody {
    const { data, keyId } = this.encryptBytes(
      Buffer.from(plaintext, 'utf8'),
      context,
    );
    return { ciphertext: new Uint8Array(data), keyId };
  }

  // A file, in the same format (iv || tag || ciphertext); its context is the
  // attachment's id, so that a file copied over another does not decrypt.
  encryptBytes(
    plaintext: Buffer,
    context: string,
  ): { data: Buffer; keyId: string } {
    const keyId = this.messagingKeys.currentKeyId;
    const key = this.messagingKeys.keys.get(keyId) as Buffer;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return { data: Buffer.concat([iv, cipher.getAuthTag(), data]), keyId };
  }

  // Decrypts a file as it streams: the header (iv || tag) is read first, the
  // ciphertext goes through the returned decipher, whose end fails when the
  // file was altered, belongs to another attachment or the key is wrong.
  createFileDecipher(
    header: Buffer,
    keyId: string,
    context: string,
  ): DecipherGCM {
    const key = this.messagingKeys.keys.get(keyId);

    if (!key || header.length !== FILE_HEADER_LENGTH) {
      throw new MessageDecryptionError();
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      header.subarray(0, IV_LENGTH),
      { authTagLength: TAG_LENGTH },
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(header.subarray(IV_LENGTH, FILE_HEADER_LENGTH));
    return decipher;
  }

  decrypt(ciphertext: Uint8Array, keyId: string, context: string): string {
    const key = this.messagingKeys.keys.get(keyId);
    const stored = Buffer.from(ciphertext);

    if (!key || stored.length < IV_LENGTH + TAG_LENGTH) {
      throw new MessageDecryptionError();
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        stored.subarray(0, IV_LENGTH),
        { authTagLength: TAG_LENGTH },
      );
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(stored.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));

      return Buffer.concat([
        decipher.update(stored.subarray(IV_LENGTH + TAG_LENGTH)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new MessageDecryptionError();
    }
  }
}

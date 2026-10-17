import { randomBytes } from 'node:crypto';

import {
  FILE_HEADER_LENGTH,
  IV_LENGTH,
  MessageCrypto,
  MessageDecryptionError,
  MessagingKeysError,
  parseMessagingKeys,
  TAG_LENGTH,
} from './message-crypto';

const key = () => randomBytes(32).toString('base64');
const K1 = key();
const K2 = key();
const CONVERSATION = 'conversation-a';

describe('parseMessagingKeys', () => {
  it('reads the keys in order; the last one encrypts', () => {
    const parsed = parseMessagingKeys(` k1:${K1} , k2:${K2} `);

    expect([...parsed.keys.keys()]).toEqual(['k1', 'k2']);
    expect(parsed.currentKeyId).toBe('k2');
    expect(parsed.keys.get('k1')).toEqual(Buffer.from(K1, 'base64'));
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['only commas', ' , '],
    ['no id', K1],
    ['empty id', `:${K1}`],
    ['id too long', `abcdefghijklmnopq:${K1}`],
    ['id with a space', `k 1:${K1}`],
    ['16 bytes', `k1:${randomBytes(16).toString('base64')}`],
    ['33 bytes', `k1:${randomBytes(33).toString('base64')}`],
    ['not base64', `k1:${'é'.repeat(44)}`],
    ['base64 without padding', `k1:${K1.replace(/=+$/, '')}`],
    ['twice the same id', `k1:${K1},k1:${K2}`],
  ])('refuses %s', (_case, value) => {
    expect(() => parseMessagingKeys(value)).toThrow(MessagingKeysError);
  });

  it('never puts key material in its errors', () => {
    const secret = randomBytes(31).toString('base64');
    let message = '';

    try {
      parseMessagingKeys(`k1:${K1},k2:${secret}`);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/^MESSAGING_KEYS/);
    expect(message).not.toContain(secret);
    expect(message).not.toContain(K1);
  });
});

describe('MessageCrypto', () => {
  const crypto = MessageCrypto.fromEnv(`k1:${K1}`);

  it('decrypts what it encrypted, accents, emoji and Arabic included', () => {
    const text = 'Avis demandé : IRM du 12/10 ✅\nرأي طبي';
    const encrypted = crypto.encrypt(text, CONVERSATION);

    expect(encrypted.keyId).toBe('k1');
    expect(encrypted.ciphertext.length).toBe(
      IV_LENGTH + TAG_LENGTH + Buffer.byteLength(text),
    );
    expect(Buffer.from(encrypted.ciphertext).toString('utf8')).not.toContain(
      'IRM',
    );
    expect(
      crypto.decrypt(encrypted.ciphertext, encrypted.keyId, CONVERSATION),
    ).toBe(text);
  });

  it('uses a new IV each time', () => {
    const first = crypto.encrypt('même texte', CONVERSATION).ciphertext;
    const second = crypto.encrypt('même texte', CONVERSATION).ciphertext;

    expect(first.subarray(0, IV_LENGTH)).not.toEqual(
      second.subarray(0, IV_LENGTH),
    );
    expect(first).not.toEqual(second);
  });

  it.each([
    ['the data', IV_LENGTH + TAG_LENGTH],
    ['the tag', IV_LENGTH],
    ['the IV', 0],
  ])('refuses a body whose %s was altered', (_part, offset) => {
    const { ciphertext, keyId } = crypto.encrypt('Résultat', CONVERSATION);
    const altered = Buffer.from(ciphertext);
    altered[offset] ^= 0x01;

    expect(() => crypto.decrypt(altered, keyId, CONVERSATION)).toThrow(
      MessageDecryptionError,
    );
  });

  it('refuses a body moved to another conversation', () => {
    const { ciphertext, keyId } = crypto.encrypt('Résultat', CONVERSATION);

    expect(() => crypto.decrypt(ciphertext, keyId, 'conversation-b')).toThrow(
      MessageDecryptionError,
    );
  });

  it('refuses a truncated body and an unknown key', () => {
    const { ciphertext } = crypto.encrypt('Résultat', CONVERSATION);

    expect(() =>
      crypto.decrypt(ciphertext.subarray(0, 20), 'k1', CONVERSATION),
    ).toThrow(MessageDecryptionError);
    expect(() => crypto.decrypt(ciphertext, 'k9', CONVERSATION)).toThrow(
      MessageDecryptionError,
    );
  });

  it('keeps reading old bodies after a key rotation, and encrypts with the new key', () => {
    const before = crypto.encrypt('Avant la rotation', CONVERSATION);
    const rotated = MessageCrypto.fromEnv(`k1:${K1},k2:${K2}`);
    const after = rotated.encrypt('Après la rotation', CONVERSATION);

    expect(rotated.currentKeyId).toBe('k2');
    expect(after.keyId).toBe('k2');
    expect(rotated.decrypt(before.ciphertext, 'k1', CONVERSATION)).toBe(
      'Avant la rotation',
    );
    expect(rotated.decrypt(after.ciphertext, 'k2', CONVERSATION)).toBe(
      'Après la rotation',
    );
    // A body is read with its own key only.
    expect(() =>
      rotated.decrypt(before.ciphertext, 'k2', CONVERSATION),
    ).toThrow(MessageDecryptionError);
    // Without k1, the old bodies are lost: k1 must stay while in use.
    expect(() =>
      MessageCrypto.fromEnv(`k2:${K2}`).decrypt(
        before.ciphertext,
        'k1',
        CONVERSATION,
      ),
    ).toThrow(MessageDecryptionError);
  });
});

describe('MessageCrypto files', () => {
  const crypto = MessageCrypto.fromEnv(
    `k1:${randomBytes(32).toString('base64')}`,
  );
  const file = randomBytes(70_000);

  function decrypt(stored: Buffer, keyId: string, context: string): Buffer {
    const decipher = crypto.createFileDecipher(
      stored.subarray(0, FILE_HEADER_LENGTH),
      keyId,
      context,
    );
    return Buffer.concat([
      decipher.update(stored.subarray(FILE_HEADER_LENGTH)),
      decipher.final(),
    ]);
  }

  it('encrypts a file, never in clear, and decrypts it as a stream would', () => {
    const { data, keyId } = crypto.encryptBytes(file, 'attachment-1');

    expect(keyId).toBe('k1');
    expect(data.length).toBe(FILE_HEADER_LENGTH + file.length);
    expect(data.includes(file.subarray(0, 64))).toBe(false);
    expect(decrypt(data, keyId, 'attachment-1').equals(file)).toBe(true);
  });

  it('refuses a file copied over another attachment, or altered', () => {
    const { data, keyId } = crypto.encryptBytes(file, 'attachment-1');

    expect(() => decrypt(data, keyId, 'attachment-2')).toThrow();

    const altered = Buffer.from(data);
    altered[FILE_HEADER_LENGTH + 10] ^= 0xff;
    expect(() => decrypt(altered, keyId, 'attachment-1')).toThrow();
  });

  it('refuses an unknown key or a short header', () => {
    const { data } = crypto.encryptBytes(file, 'attachment-1');
    expect(() =>
      crypto.createFileDecipher(
        data.subarray(0, FILE_HEADER_LENGTH),
        'k9',
        'attachment-1',
      ),
    ).toThrow(MessageDecryptionError);
    expect(() =>
      crypto.createFileDecipher(data.subarray(0, 10), 'k1', 'attachment-1'),
    ).toThrow(MessageDecryptionError);
  });
});

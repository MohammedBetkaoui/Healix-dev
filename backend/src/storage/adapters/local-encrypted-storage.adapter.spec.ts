import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LocalEncryptedStorageAdapter,
} from './local-encrypted-storage.adapter';
import {
  fileIntegrityFailed,
  fileNotFound,
  StorageKeyExistsError,
} from '../storage-errors';
import { createStorageKey } from '../storage-keys';

let root: string;
let adapter: LocalEncryptedStorageAdapter;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'healix-storage-'));
  adapter = new LocalEncryptedStorageAdapter(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalEncryptedStorageAdapter', () => {
  it('writes an object under its key and reads the same bytes back', async () => {
    const key = createStorageKey('MEDICAL_SENSITIVE');
    const data = Buffer.from('stored bytes');

    await adapter.put(key, data, 'application/pdf');

    expect(await adapter.read(key).then((read) => read.equals(data))).toBe(
      true,
    );
    expect(await adapter.exists(key)).toBe(true);
  });

  it('keeps the key folder structure under the root', async () => {
    const key = createStorageKey('VERIFICATION_SENSITIVE');

    await adapter.put(key, Buffer.from('x'), 'application/pdf');

    // hx/<namespace>/<aa>/<32 hex>.bin — three nested folders, no identity.
    const segments = key.split('/');
    expect(segments).toHaveLength(4);
    expect(segments[1]).toBe('verification');
    expect(segments[2]).toHaveLength(2);
    expect(segments[3]).toMatch(/^[0-9a-f]{32}\.bin$/);
  });

  it('refuses to overwrite an existing object (the keys are unique)', async () => {
    const key = createStorageKey('MEDICAL_SENSITIVE');

    await adapter.put(key, Buffer.from('first'), 'application/pdf');

    await expect(
      adapter.put(key, Buffer.from('second'), 'application/pdf'),
    ).rejects.toThrow(StorageKeyExistsError);
    expect(await adapter.read(key)).toEqual(Buffer.from('first'));
  });

  it('answers FILE_NOT_FOUND for a missing object (404, no path in the error)', async () => {
    const error = await adapter
      .read('hx/medical/ab/' + '0'.repeat(32) + '.bin')
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as { getStatus?: () => number }).getStatus?.()).toBe(404);
    expect((error as { response?: { code: string } }).response?.code).toBe(
      'FILE_NOT_FOUND',
    );
    expect(() => {
      throw error;
    }).toThrow(fileNotFound().message);
  });

  it('reads the first bytes without holding the whole object (the header slice)', async () => {
    const key = createStorageKey('MEDICAL_SENSITIVE');
    const data = Buffer.concat([Buffer.alloc(32, 1), randomBig(64)]);

    await adapter.put(key, data, 'application/pdf');

    const header = await adapter.readSlice(key, 32);
    expect(header.length).toBe(32);
    expect(header.every((byte) => byte === 1)).toBe(true);
  });

  it('answers a short slice for an object smaller than the requested slice', async () => {
    const key = createStorageKey('PRIVATE');
    const data = Buffer.from('tiny');

    await adapter.put(key, data, 'text/plain');

    expect((await adapter.readSlice(key, 32)).equals(data)).toBe(true);
  });

  it('opens a stream that starts at the given offset', async () => {
    const key = createStorageKey('MEDICAL_SENSITIVE');
    const data = Buffer.concat([Buffer.alloc(32, 7), randomBig(128)]);

    await adapter.put(key, data, 'application/pdf');

    const chunks: Buffer[] = [];
    for await (const chunk of await adapter.open(key, 32)) {
      chunks.push(chunk as Buffer);
    }

    expect(Buffer.concat(chunks).equals(data.subarray(32))).toBe(true);
  });

  it('deletes an object and prunes the folders it empties', async () => {
    const key = createStorageKey('MEDICAL_SENSITIVE');

    await adapter.put(key, Buffer.from('x'), 'application/pdf');
    await adapter.delete(key);

    expect(await adapter.exists(key)).toBe(false);
    // The key's folder tree is gone (no orphan folders); a sibling folder
    // of another object would have been kept, and so is the root.
    expect(existsSync(join(root, 'hx', 'medical'))).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it('keeps the folders of a sibling object (only what a delete emptied is pruned)', async () => {
    const first = createStorageKey('MEDICAL_SENSITIVE');
    const second = createStorageKey('MEDICAL_SENSITIVE');

    await adapter.put(first, Buffer.from('a'), 'application/pdf');
    await adapter.put(second, Buffer.from('b'), 'application/pdf');
    await adapter.delete(first);

    expect(existsSync(join(root, 'hx', 'medical'))).toBe(true);
    expect(await adapter.exists(second)).toBe(true);
  });

  it('deleting an object that is already gone succeeds (the row is the source of truth)', async () => {
    await expect(
      adapter.delete('hx/medical/ab/' + '0'.repeat(32) + '.bin'),
    ).resolves.toBeUndefined();
  });

  it('removes everything under a prefix (the images of a volumetry)', async () => {
    const prefix = createStorageKey('MEDICAL_SENSITIVE').replace(
      /[^/]+\.bin$/,
      '',
    );
    await adapter.put(prefix + 'a.bin', Buffer.from('a'), 'image/png');
    await adapter.put(prefix + 'b.bin', Buffer.from('b'), 'image/png');

    await adapter.deletePrefix(prefix);

    expect(await adapter.exists(prefix + 'a.bin')).toBe(false);
    expect(await adapter.exists(prefix + 'b.bin')).toBe(false);
  });

  it('refuses a reference that escapes the root (no ../ traversal)', async () => {
    const escape = await adapter
      .read('../../secret.bin')
      .catch((caught: Error) => caught);

    expect((escape as { getStatus?: () => number }).getStatus?.()).toBe(500);
    expect(
      (escape as { response?: { code: string } }).response?.code,
    ).toBe('FILE_INTEGRITY_FAILED');
    expect(() => {
      throw escape;
    }).toThrow(fileIntegrityFailed().message);
    expect((escape as Error).message).not.toContain(root);
  });

  it('stores nothing outside its root, whatever the key looks like', async () => {
    await expect(
      adapter.put('../../escape.bin', Buffer.from('x'), 'text/plain'),
    ).rejects.toMatchObject({ response: { code: 'FILE_INTEGRITY_FAILED' } });
  });
});

function randomBig(bytes: number): Buffer {
  const data = Buffer.alloc(bytes);

  for (let index = 0; index < bytes; index += 1) {
    data[index] = (index * 7) % 256;
  }

  return data;
}

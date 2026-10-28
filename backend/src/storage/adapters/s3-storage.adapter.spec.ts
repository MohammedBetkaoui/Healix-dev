import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { S3StorageAdapter } from './s3-storage.adapter';
import { fileNotFound } from '../storage-errors';

const options = {
  region: 'us-east-1',
  bucket: 'healix-test',
  accessKeyId: 'test-access',
  secretAccessKey: 'test-secret',
  forcePathStyle: true,
};

type SendCommand = { input: Record<string, unknown> };
type Send = jest.Mock<Promise<unknown>, [SendCommand]>;

// The adapter takes an S3Client; the tests give it this shape only.
function mockSend(
  implementation: (command: SendCommand) => Promise<unknown>,
): Send {
  return jest.fn(implementation) as unknown as Send;
}

function adapterWith(send: Send): S3StorageAdapter {
  return new S3StorageAdapter(options, { send } as unknown as S3Client);
}

function objectBody(data: Buffer): Readable {
  return Readable.from([data]);
}

const key = 'hx/medical/ab/' + 'a'.repeat(32) + '.bin';

const notFound = {
  name: 'NoSuchKey',
  $metadata: { httpStatusCode: 404 },
};

describe('S3StorageAdapter', () => {
  it('writes an object into the private bucket, with its mime type', async () => {
    const send = mockSend(async () => ({}));
    const adapter = adapterWith(send);

    await adapter.put(key, Buffer.from('data'), 'application/pdf');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'healix-test',
      Key: key,
      ContentType: 'application/pdf',
    });
  });

  it('answers STORAGE_UNAVAILABLE when the write fails', async () => {
    const send = mockSend(async () => {
      throw new Error('network down');
    });
    const adapter = adapterWith(send);

    await expect(
      adapter.put(key, Buffer.from('d'), 'application/pdf'),
    ).rejects.toMatchObject({ response: { code: 'STORAGE_UNAVAILABLE' } });
  });

  it('reads an object through a stream and answers its bytes', async () => {
    const data = Buffer.from('the file');
    const send = mockSend(async () => ({ Body: objectBody(data) }));
    const adapter = adapterWith(send);

    expect(
      (await adapter.read(key)).equals(data),
    ).toBe(true);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it('answers FILE_NOT_FOUND for a missing object (404, nothing else)', async () => {
    const send = mockSend(async () => {
      throw notFound;
    });
    const adapter = adapterWith(send);

    const caught = (await adapter.read(key).catch((error: unknown) => error)) as Error;

    expect((caught as { response?: { code: string } }).response?.code).toBe(
      'FILE_NOT_FOUND',
    );
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(404);
    expect(caught.message).toBe(fileNotFound().message);
  });

  it('answers STORAGE_UNAVAILABLE for an error that is not a missing object', async () => {
    const send = mockSend(async () => {
      throw { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } };
    });
    const adapter = adapterWith(send);

    await expect(adapter.exists(key)).rejects.toMatchObject({
      response: { code: 'STORAGE_UNAVAILABLE' },
    });
  });

  it('opens the object from an offset with a Range request (decrypted streaming)', async () => {
    const send = mockSend(async () => ({ Body: objectBody(Buffer.from('tail')) }));
    const adapter = adapterWith(send);

    await adapter.open(key, 32);

    expect(send.mock.calls[0][0].input.Range).toBe('bytes=32-');
  });

  it('reads a header slice with a bounded Range request', async () => {
    const send = mockSend(async () => ({ Body: objectBody(Buffer.alloc(32)) }));
    const adapter = adapterWith(send);

    await adapter.readSlice(key, 32);

    expect(send.mock.calls[0][0].input.Range).toBe('bytes=0-31');
  });

  it('answers an empty stream for a range that holds no bytes (a read at the very end)', async () => {
    const send = mockSend(async () => {
      throw { name: 'RangeNotSatisfiable', $metadata: { httpStatusCode: 416 } };
    });
    const adapter = adapterWith(send);

    const stream = await adapter.open(key, 32);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    expect(chunks).toEqual([]);
  });

  it('tells when an object exists with a head request', async () => {
    const send = mockSend(async () => ({}));
    const adapter = adapterWith(send);

    expect(await adapter.exists(key)).toBe(true);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('answers false when the object does not exist', async () => {
    const send = mockSend(async () => {
      throw notFound;
    });
    const adapter = adapterWith(send);

    expect(await adapter.exists(key)).toBe(false);
  });

  it('deletes an object (a missing one included: the delete stays idempotent)', async () => {
    const send = mockSend(async () => ({}));
    const adapter = adapterWith(send);

    await adapter.delete(key);

    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('lists a prefix and deletes its objects in batches', async () => {
    const prefix = 'hx/medical/ab/' + 'a'.repeat(32) + '/';
    const send = mockSend(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: prefix + 'a.bin' },
            { Key: prefix + 'b.bin' },
            { Key: 'hx/other/c.bin' },
          ],
          IsTruncated: false,
        };
      }
      return {};
    });
    const adapter = adapterWith(send);

    await adapter.deletePrefix(prefix);

    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    const deletion = send.mock.calls[1][0];
    expect(deletion).toBeInstanceOf(DeleteObjectsCommand);
    expect(deletion.input.Delete).toEqual({
      // Only the objects of the prefix; the one outside it stays.
      Objects: [{ Key: prefix + 'a.bin' }, { Key: prefix + 'b.bin' }],
    });
  });

  it('keeps listing until the prefix is exhausted', async () => {
    const prefix = 'hx/medical/ab/' + 'a'.repeat(32) + '/';
    let listed = 0;
    const send = mockSend(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        listed += 1;
        return {
          Contents: [{ Key: `${prefix}part-${listed}.bin` }],
          IsTruncated: listed < 3,
        };
      }
      return {};
    });
    const adapter = adapterWith(send);

    await adapter.deletePrefix(prefix);

    expect(listed).toBe(3);
    expect(send.mock.calls.at(-1)![0]).toBeInstanceOf(DeleteObjectsCommand);
  });

  it('answers STORAGE_UNAVAILABLE when the prefix deletion fails', async () => {
    const send = mockSend(async () => {
      throw new Error('timeout');
    });
    const adapter = adapterWith(send);

    await expect(adapter.deletePrefix('hx/medical/ab/')).rejects.toMatchObject(
      { response: { code: 'STORAGE_UNAVAILABLE' } },
    );
  });
});

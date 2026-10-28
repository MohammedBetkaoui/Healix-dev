import { Injectable } from '@nestjs/common';
import {
  type GetObjectCommandInput,
  type GetObjectCommandOutput,
  S3Client,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import {
  fileNotFound,
  storageUnavailable,
} from '../storage-errors';
import { type StorageAdapter } from '../storage.types';

// The storage of the production: any S3-compatible object store — AWS S3,
// MinIO, Cloudflare R2, a self-hosted endpoint — chosen by configuration, no
// provider hardcoded. The bucket is private (no public object, no permanent
// URL): the sensitive files reach it already encrypted, and every download
// goes back through the backend, which has authorized the business resource
// and streams the decrypted bytes itself.
//
// The client is built from the configuration (endpoint, region, bucket,
// keys, path-style); nothing else in the application talks to S3.
export type S3StorageOptions = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions, client?: S3Client) {
    this.bucket = options.bucket;
    this.client =
      client ??
      new S3Client({
        region: options.region,
        // MinIO, R2 and the self-hosted endpoints: path-style addressing, an
        // endpoint that is not amazonaws.com, no provider chain.
        endpoint: options.endpoint,
        forcePathStyle: options.forcePathStyle,
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
      });
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: mimeType,
        }),
      );
    } catch {
      throw storageUnavailable();
    }
  }

  async read(key: string): Promise<Buffer> {
    const body = await this.getObjectBody(key);
    return streamToBuffer(body as Readable);
  }

  async open(key: string, start = 0): Promise<Readable> {
    const response = await this.getObject(key, start);
    return response.Body as Readable;
  }

  // The first `length` bytes, to read the format header before streaming.
  async readSlice(key: string, length: number): Promise<Buffer> {
    const response = await this.getObject(key, 0, length - 1);
    return streamToBuffer(response.Body as Readable);
  }

  async delete(key: string): Promise<void> {
    try {
      // Deleting a key that holds no object succeeds: the caller's row is
      // the source of truth, and this must stay idempotent.
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw storageUnavailable();
    }
  }

  // A group of objects under a prefix (the images of a volumetry): listed,
  // then deleted in batches of up to 1000 keys.
  async deletePrefix(prefix: string): Promise<void> {
    try {
      for (;;) {
        const listed = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
          }),
        );
        const keys = (listed.Contents ?? [])
          .map((object) => object.Key as string)
          .filter((objectKey) => objectKey.startsWith(prefix));

        if (keys.length === 0) return;

        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((objectKey) => ({ Key: objectKey })) },
          }),
        );

        if (!listed.IsTruncated) return;
      }
    } catch {
      throw storageUnavailable();
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw storageUnavailable();
    }
  }

  private async getObject(
    key: string,
    start: number,
    end?: number,
  ): Promise<GetObjectCommandOutput> {
    const input: GetObjectCommandInput = { Bucket: this.bucket, Key: key };

    if (start > 0 || end !== undefined) {
      input.Range = `bytes=${start}-${end ?? ''}`;
    }

    try {
      return await this.client.send(new GetObjectCommand(input));
    } catch (error) {
      // An empty tail (a read that starts at the exact end) is an empty
      // stream, not an error; a missing object is a 404 for the caller.
      if (isRangeNotSatisfiable(error)) {
        return { Body: emptyReadable() } as GetObjectCommandOutput;
      }
      if (isMissingObject(error)) throw fileNotFound();
      throw storageUnavailable();
    }
  }

  private async getObjectBody(key: string): Promise<unknown> {
    const response = await this.getObject(key, 0);
    return response.Body;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

function emptyReadable(): Readable {
  const stream = new Readable({
    read() {
      this.push(null);
    },
  });

  return stream;
}

function isMissingObject(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

function isRangeNotSatisfiable(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;

  return status === 416;
}

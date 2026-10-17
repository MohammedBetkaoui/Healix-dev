import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable } from 'node:stream';

import { type HttpException, NotFoundException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { ConversationType } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../common/utils/checksum.util';
import { UserRole } from '../common/enums/user-role.enum';
import { type PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { type PatientAuditService } from '../patients/patient-audit.service';
import { type PrismaService } from '../prisma/prisma.service';
import { AttachmentStorage } from './attachment-storage';
import { AttachmentsService } from './attachments.service';
import { type ConversationsService } from './conversations.service';
import { MessageCrypto } from './message-crypto';

const ME = 'user-me';
const actor: AuthenticatedUserPayload = {
  email: 'me@healix.test',
  role: UserRole.AFFILIATED_DOCTOR,
  sub: ME,
  tokenType: 'access',
};
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n', 'latin1'),
  randomBytes(4_000),
]);

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function upload(buffer: Buffer, originalname = 'ECG.pdf') {
  return { buffer, originalname, size: buffer.length } as Express.Multer.File;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'healix-attachments-'));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function setup() {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    messageAttachment: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row: Record<string, unknown> = {
          createdAt: new Date(),
          messageId: null,
          ...args.data,
        };
        rows.set(row.id as string, row);
        return Promise.resolve(row);
      }),
      deleteMany: jest.fn((args: { where: { id: string } }) => {
        const existed = rows.delete(args.where.id);
        return Promise.resolve({ count: existed ? 1 : 0 });
      }),
      findMany: jest.fn(() =>
        Promise.resolve(
          [...rows.values()].filter((row) => row.messageId === null),
        ),
      ),
      findUnique: jest.fn((args: { where: { id: string } }) => {
        const row = rows.get(args.where.id);
        return Promise.resolve(row ? { message: null, ...row } : null);
      }),
    },
    patientDocument: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const conversations = {
    getParticipation: jest.fn().mockResolvedValue({
      conversation: {
        id: 'conversation-1',
        patientId: null,
        type: ConversationType.DIRECT,
      },
    }),
  };
  const crypto = MessageCrypto.fromEnv(
    `k1:${randomBytes(32).toString('base64')}`,
  );
  const storage = new AttachmentStorage({
    get: () => root,
  } as unknown as ConfigService);
  const patientFiles = {
    openStoredFile: jest.fn(),
    readStoredFile: jest.fn(),
  };
  const patientAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AttachmentsService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    crypto,
    storage,
    patientFiles as unknown as PatientFileStorageService,
    patientAudit as unknown as PatientAuditService,
  );
  return { conversations, patientAudit, patientFiles, prisma, rows, service };
}

async function filesOnDisk(): Promise<string[]> {
  const folder = join(root, 'messaging', 'conversation-1');
  return readdir(folder).catch(() => []);
}

describe('AttachmentsService.upload', () => {
  it('refuses a file whose content is not a PDF, PNG or JPEG, whatever its name', async () => {
    const { prisma, service } = setup();
    const executable = Buffer.concat([
      Buffer.from('MZ', 'latin1'),
      randomBytes(512),
    ]);

    const error = await errorOf(
      service.upload(actor, 'conversation-1', upload(executable, 'radio.png')),
    );

    expect(error.getStatus()).toBe(415);
    expect(codeOf(error)).toBe('INVALID_ATTACHMENT_TYPE');
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    expect(await filesOnDisk()).toEqual([]);
  });

  it('refuses more than 10 MB, and a missing file', async () => {
    const { service } = setup();
    const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 1);
    PDF.copy(tooLarge);

    const error = await errorOf(
      service.upload(actor, 'conversation-1', upload(tooLarge)),
    );
    expect(error.getStatus()).toBe(413);
    expect(codeOf(error)).toBe('ATTACHMENT_TOO_LARGE');

    expect(
      codeOf(await errorOf(service.upload(actor, 'conversation-1', undefined))),
    ).toBe('ATTACHMENT_MISSING');
  });

  it('stores the file encrypted on disk, with the SHA-256 of its clear content', async () => {
    const { rows, service } = setup();

    const view = await service.upload(
      actor,
      'conversation-1',
      upload(PDF, 'compte rendu.exe'),
    );

    expect(view).toMatchObject({
      mimeType: 'application/pdf',
      originalName: 'compte rendu.pdf',
      sizeBytes: PDF.length,
    });
    const row = rows.get(view.id) as Record<string, string>;
    expect(row.sha256).toBe(createSha256Checksum(PDF));
    expect(row.keyId).toBe('k1');
    expect(await filesOnDisk()).toEqual([`${view.id}.bin`]);

    const onDisk = await readFile(row.storagePath);
    expect(onDisk.includes(PDF.subarray(0, 64))).toBe(false);
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false);
  });
});

describe('AttachmentsService.download', () => {
  it('gives the file back decrypted as it streams', async () => {
    const { service } = setup();
    const { id } = await service.upload(actor, 'conversation-1', upload(PDF));

    const file = await service.download(actor, id);

    expect(file).toMatchObject({
      mimeType: 'application/pdf',
      originalName: 'ECG.pdf',
      sizeBytes: PDF.length,
    });
    expect((await readAll(file.stream)).equals(PDF)).toBe(true);
  });

  it('fails the stream when the file on disk was altered', async () => {
    const { rows, service } = setup();
    const { id } = await service.upload(actor, 'conversation-1', upload(PDF));
    const path = (rows.get(id) as Record<string, string>).storagePath;
    const altered = await readFile(path);
    altered[altered.length - 1] ^= 0xff;
    await writeFile(path, altered);

    const file = await service.download(actor, id);

    await expect(readAll(file.stream)).rejects.toThrow();
  });

  it('keeps a file not sent yet to its uploader, and every file to the participants', async () => {
    const { conversations, service } = setup();
    const { id } = await service.upload(actor, 'conversation-1', upload(PDF));

    const other = { ...actor, sub: 'user-other' };
    expect(codeOf(await errorOf(service.download(other, id)))).toBe(
      'ATTACHMENT_NOT_FOUND',
    );

    conversations.getParticipation.mockRejectedValue(new NotFoundException());
    expect(codeOf(await errorOf(service.download(actor, id)))).toBe(
      'ATTACHMENT_NOT_FOUND',
    );
  });
});

describe('AttachmentsService.fromRecord', () => {
  it('is for case discussions only', async () => {
    const { service } = setup();
    const error = await errorOf(
      service.fromRecord(actor, 'conversation-1', 'document-1'),
    );
    expect(codeOf(error)).toBe('CASE_ONLY');
  });

  it('shares a document of the discussion patient by reference, its type read from its content', async () => {
    const { conversations, patientFiles, prisma, rows, service } = setup();
    conversations.getParticipation.mockResolvedValue({
      conversation: {
        id: 'conversation-1',
        patientId: 'patient-1',
        type: ConversationType.CASE,
      },
    });

    // Another patient's document: not found.
    expect(
      codeOf(
        await errorOf(
          service.fromRecord(actor, 'conversation-1', 'document-9'),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
    expect(prisma.patientDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'document-9', patientId: 'patient-1' },
    });

    prisma.patientDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      localPath: '/uploads/patients/patient-1/documents/x.pdf',
      originalName: 'Bilan.pdf',
    });
    patientFiles.readStoredFile.mockResolvedValue(PDF);
    const view = await service.fromRecord(
      actor,
      'conversation-1',
      'document-1',
    );

    expect(view).toMatchObject({
      mimeType: 'application/pdf',
      originalName: 'Bilan.pdf',
    });
    expect(rows.get(view.id)).toMatchObject({
      patientDocumentId: 'document-1',
      sha256: createSha256Checksum(PDF),
    });
    // No copy.
    expect(rows.get(view.id)?.storagePath).toBeUndefined();
    expect(await filesOnDisk()).toEqual([]);
  });
});

describe('AttachmentsService.purgeUnsent', () => {
  it('deletes the files never sent after 24 hours, row and file', async () => {
    const { rows, service } = setup();
    const { id } = await service.upload(actor, 'conversation-1', upload(PDF));
    (rows.get(id) as Record<string, unknown>).createdAt = new Date(
      Date.now() - 25 * 60 * 60_000,
    );

    expect(await service.purgeUnsent()).toBe(1);
    expect(rows.has(id)).toBe(false);
    expect(await filesOnDisk()).toEqual([]);
  });
});

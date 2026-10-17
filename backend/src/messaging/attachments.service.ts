import { createHash, randomUUID } from 'node:crypto';
import { type Readable, Transform, type TransformCallback } from 'node:stream';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ConversationType,
  type MessageAttachment,
  ParticipantStatus,
} from '@prisma/client';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { createSha256Checksum } from '../common/utils/checksum.util';
import { PatientFileStorageService } from '../patients/documents/patient-file-storage.service';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentStorage } from './attachment-storage';
import { ConversationsService } from './conversations.service';
import {
  FILE_HEADER_LENGTH,
  MessageCrypto,
  MessageDecryptionError,
} from './message-crypto';
import {
  attachmentMissing,
  attachmentNotFound,
  attachmentTooLarge,
  caseOnly,
  documentNotFound,
  invalidAttachmentType,
} from './messaging-errors';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentNameOf,
  detectAttachmentType,
  UNSENT_ATTACHMENT_TTL_MS,
} from './messaging-rules';

export type UploadedAttachmentView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentDownload = {
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  stream: Readable;
};

// Unsent attachments deleted per round of the purge.
const PURGE_BATCH = 200;

// Hashes what goes through it and, at the end, fails the stream when the
// SHA-256 is not the one recorded at upload: an altered file never ends as a
// complete download.
class Sha256Check extends Transform {
  private readonly hash = createHash('sha256');

  constructor(private readonly expected: string) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    callback(
      this.hash.digest('hex') === this.expected
        ? null
        : new Error('Attachment checksum mismatch.'),
    );
  }
}

function toUploadedView(row: MessageAttachment): UploadedAttachmentView {
  return {
    id: row.id,
    mimeType: row.mimeType,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
  };
}

// The files of the messaging (docs/messaging-design.md, lot 4). A file is
// uploaded first, then sent with a message (attachmentIds); stored encrypted
// (AES-256-GCM, its id authenticated with it), or, in a case discussion, a
// reference to a document of the patient record, whose access is checked
// again at each download.
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly crypto: MessageCrypto,
    private readonly storage: AttachmentStorage,
    private readonly patientFiles: PatientFileStorageService,
    private readonly patientAudit: PatientAuditService,
  ) {}

  // A PDF, PNG or JPEG of 10 MB at most, its type read from its first bytes,
  // from an ACTIVE participant.
  async upload(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<UploadedAttachmentView> {
    if (!file?.buffer || file.buffer.length === 0) throw attachmentMissing();
    if (file.buffer.length > ATTACHMENT_MAX_BYTES) throw attachmentTooLarge();

    const { conversation } = await this.conversations.getParticipation(
      actor,
      conversationId,
    );
    const mimeType = detectAttachmentType(file.buffer);
    if (!mimeType) throw invalidAttachmentType();

    const id = randomUUID();
    const { data, keyId } = this.crypto.encryptBytes(file.buffer, id);
    const storagePath = await this.storage.write(conversation.id, id, data);

    try {
      const row = await this.prisma.messageAttachment.create({
        data: {
          conversationId: conversation.id,
          id,
          keyId,
          mimeType,
          originalName: attachmentNameOf(file.originalname, mimeType),
          sha256: createSha256Checksum(file.buffer),
          sizeBytes: file.buffer.length,
          storagePath,
          uploaderId: actor.sub,
        },
      });
      return toUploadedView(row);
    } catch (error) {
      await this.storage.remove(storagePath);
      throw error;
    }
  }

  // CASE only: a PDF, PNG or JPEG document of the discussion's patient,
  // shared without copy.
  async fromRecord(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    patientDocumentId: string,
  ): Promise<UploadedAttachmentView> {
    const { conversation } = await this.conversations.getParticipation(
      actor,
      conversationId,
    );

    if (
      conversation.type !== ConversationType.CASE ||
      !conversation.patientId
    ) {
      throw caseOnly();
    }

    const document = await this.prisma.patientDocument.findFirst({
      where: { id: patientDocumentId, patientId: conversation.patientId },
    });
    if (!document) throw documentNotFound();

    // Its content, not its recorded type: the record also holds DICOM files.
    const content = await this.patientFiles.readStoredFile(document.localPath);
    const mimeType = detectAttachmentType(content);
    if (!mimeType) throw invalidAttachmentType();

    const row = await this.prisma.messageAttachment.create({
      data: {
        conversationId: conversation.id,
        id: randomUUID(),
        mimeType,
        originalName: attachmentNameOf(document.originalName, mimeType),
        patientDocumentId: document.id,
        sha256: createSha256Checksum(content),
        sizeBytes: content.length,
        uploaderId: actor.sub,
      },
    });
    return toUploadedView(row);
  }

  // For the participants of the conversation (and, in a case discussion,
  // with its patient in scope); a file not sent yet, for its uploader only.
  // Decrypted as it streams, its SHA-256 checked at the end.
  async download(
    actor: AuthenticatedUserPayload,
    attachmentId: string,
  ): Promise<AttachmentDownload> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      include: { message: { select: { deletedAt: true } } },
      where: { id: attachmentId },
    });

    if (
      !attachment ||
      (attachment.message === null
        ? attachment.uploaderId !== actor.sub
        : attachment.message.deletedAt !== null)
    ) {
      throw attachmentNotFound();
    }

    const { conversation } = await this.conversations
      .getParticipation(actor, attachment.conversationId, [
        ParticipantStatus.ACTIVE,
        ParticipantStatus.PENDING,
      ])
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) throw attachmentNotFound();
        throw error;
      });

    const source = attachment.patientDocumentId
      ? await this.openRecordDocument(
          actor,
          attachment.patientDocumentId,
          conversation.patientId,
          conversation.id,
        )
      : await this.openEncrypted(attachment);

    const check = new Sha256Check(attachment.sha256);
    source.on('error', (error) => check.destroy(error));

    return {
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
      stream: source.pipe(check),
    };
  }

  // The attachments never sent, older than 24 hours: their row, then their
  // file. Returns how many were deleted.
  async purgeUnsent(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - UNSENT_ATTACHMENT_TTL_MS);
    let deleted = 0;

    for (;;) {
      const stale = await this.prisma.messageAttachment.findMany({
        select: { id: true, storagePath: true },
        take: PURGE_BATCH,
        where: { createdAt: { lt: before }, messageId: null },
      });

      for (const attachment of stale) {
        // Conditional: one sent meanwhile stays.
        const { count } = await this.prisma.messageAttachment.deleteMany({
          where: { id: attachment.id, messageId: null },
        });
        if (count > 0) {
          deleted += 1;
          if (attachment.storagePath) {
            await this.storage.remove(attachment.storagePath);
          }
        }
      }

      if (stale.length < PURGE_BATCH) return deleted;
    }
  }

  private async openEncrypted(
    attachment: MessageAttachment,
  ): Promise<Readable> {
    if (!attachment.storagePath || !attachment.keyId) {
      throw attachmentNotFound();
    }

    const { body, header } = await this.storage.open(
      attachment.storagePath,
      FILE_HEADER_LENGTH,
    );

    try {
      const decipher = this.crypto.createFileDecipher(
        header,
        attachment.keyId,
        attachment.id,
      );
      body.on('error', (error) => decipher.destroy(error));
      return body.pipe(decipher);
    } catch (error) {
      body.destroy();
      if (error instanceof MessageDecryptionError) {
        this.logger.error(
          `Attachment ${attachment.id} could not be decrypted (key ${attachment.keyId}).`,
        );
        throw attachmentNotFound();
      }
      throw error;
    }
  }

  // The document must still belong to the discussion's patient; each
  // opening goes to the patient's audit trail, as in the record.
  private async openRecordDocument(
    actor: AuthenticatedUserPayload,
    patientDocumentId: string,
    patientId: string | null,
    conversationId: string,
  ): Promise<Readable> {
    const document = patientId
      ? await this.prisma.patientDocument.findFirst({
          where: { id: patientDocumentId, patientId },
        })
      : null;
    if (!document) throw attachmentNotFound();

    let stream: Readable;
    try {
      stream = this.patientFiles.openStoredFile(document.localPath);
    } catch (error) {
      if (error instanceof NotFoundException) throw attachmentNotFound();
      throw error;
    }

    try {
      await this.patientAudit.log(actor, 'DOCUMENT_VIEWED', document.id, {
        conversationId,
        documentType: document.documentType,
        patientId: document.patientId,
        via: 'MESSAGING',
      });
    } catch (error) {
      stream.destroy();
      throw error;
    }
    return stream;
  }
}

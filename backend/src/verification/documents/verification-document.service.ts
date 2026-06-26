import { BadRequestException, Injectable } from '@nestjs/common';

import { type Prisma, type VerificationDocument } from '@prisma/client';
import {
  requiredEstablishmentDocumentTypes,
  type VerificationDocumentType,
} from '../../common/enums/verification-document-type.enum';
import { VerificationDocumentStatus } from '../../common/enums/verification-document-status.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { type UploadedDocumentSummary } from '../types/verification.types';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type UpsertDocumentInput = {
  verificationRequestId: string;
  documentType: VerificationDocumentType;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  localPath: string;
  checksum: string;
};

@Injectable()
export class VerificationDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingDocument(
    verificationRequestId: string,
    documentType: VerificationDocumentType,
    client: PrismaExecutor = this.prisma,
  ): Promise<VerificationDocument | null> {
    return client.verificationDocument.findUnique({
      where: {
        verificationRequestId_documentType: {
          verificationRequestId,
          documentType,
        },
      },
    });
  }

  async upsertDocument(
    input: UpsertDocumentInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<VerificationDocument> {
    return client.verificationDocument.upsert({
      where: {
        verificationRequestId_documentType: {
          verificationRequestId: input.verificationRequestId,
          documentType: input.documentType,
        },
      },
      create: {
        verificationRequestId: input.verificationRequestId,
        documentType: input.documentType,
        originalName: input.originalName,
        storedName: input.storedName,
        mimeType: input.mimeType,
        size: input.size,
        localPath: input.localPath,
        checksum: input.checksum,
        status: VerificationDocumentStatus.UPLOADED,
      },
      update: {
        originalName: input.originalName,
        storedName: input.storedName,
        mimeType: input.mimeType,
        size: input.size,
        localPath: input.localPath,
        checksum: input.checksum,
        status: VerificationDocumentStatus.UPLOADED,
        uploadedAt: new Date(),
      },
    });
  }

  async findDocumentForEstablishment(
    documentId: string,
    establishmentId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<VerificationDocument | null> {
    return client.verificationDocument.findFirst({
      where: {
        id: documentId,
        verificationRequest: {
          establishmentId,
        },
      },
    });
  }

  async deleteDocument(
    documentId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<VerificationDocument> {
    return client.verificationDocument.delete({
      where: {
        id: documentId,
      },
    });
  }

  getMissingRequiredDocuments(
    documents: Pick<VerificationDocument, 'documentType' | 'status'>[],
  ): VerificationDocumentType[] {
    const uploadedTypes = new Set(
      documents
        .filter((document) => document.status === VerificationDocumentStatus.UPLOADED)
        .map((document) => document.documentType),
    );

    return requiredEstablishmentDocumentTypes.filter(
      (documentType) => !uploadedTypes.has(documentType),
    );
  }

  assertRequiredDocumentsPresent(
    documents: Pick<VerificationDocument, 'documentType' | 'status'>[],
  ): void {
    const missingDocuments = this.getMissingRequiredDocuments(documents);

    if (missingDocuments.length > 0) {
      throw new BadRequestException('Document obligatoire manquant.');
    }
  }

  toDocumentSummary(document: VerificationDocument): UploadedDocumentSummary {
    return {
      id: document.id,
      documentType: document.documentType,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      status: document.status,
      uploadedAt: document.uploadedAt,
    };
  }
}

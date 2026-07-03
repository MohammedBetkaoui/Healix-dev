import { BadRequestException, Injectable } from '@nestjs/common';

import { type PaymentProofDocument, type Prisma } from '@prisma/client';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PaymentProofDocumentType } from '../../common/enums/payment-proof-document-type.enum';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type UpsertPaymentProofInput = {
  paymentId: string;
  documentType: PaymentProofDocumentType;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  localPath: string;
  checksum: string;
};

@Injectable()
export class PaymentProofService {
  constructor(private readonly prisma: PrismaService) {}

  assertProofTypeMatchesPaymentMethod(
    paymentMethod: PaymentMethod,
    proofType: PaymentProofDocumentType,
  ): void {
    if (
      paymentMethod === PaymentMethod.MANUAL_POST_TRANSFER &&
      proofType !== PaymentProofDocumentType.POST_TRANSFER_PROOF
    ) {
      throw new BadRequestException('Type de preuve invalide.');
    }

    if (
      paymentMethod === PaymentMethod.BARIDIMOB_RECEIPT &&
      proofType !== PaymentProofDocumentType.BARIDIMOB_RECEIPT
    ) {
      throw new BadRequestException('Type de preuve invalide.');
    }
  }

  async findByPaymentId(
    paymentId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<PaymentProofDocument | null> {
    return client.paymentProofDocument.findUnique({
      where: {
        paymentId,
      },
    });
  }

  async upsertProof(
    input: UpsertPaymentProofInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<PaymentProofDocument> {
    return client.paymentProofDocument.upsert({
      create: {
        checksum: input.checksum,
        documentType: input.documentType,
        localPath: input.localPath,
        mimeType: input.mimeType,
        originalName: input.originalName,
        paymentId: input.paymentId,
        size: input.size,
        storedName: input.storedName,
      },
      update: {
        checksum: input.checksum,
        documentType: input.documentType,
        localPath: input.localPath,
        mimeType: input.mimeType,
        originalName: input.originalName,
        size: input.size,
        storedName: input.storedName,
        uploadedAt: new Date(),
      },
      where: {
        paymentId: input.paymentId,
      },
    });
  }

  toPublicProof(
    proof:
      | {
          documentType: string;
          id: string;
          mimeType: string;
          originalName: string;
          size: number;
          uploadedAt: Date;
        }
      | null,
  ) {
    if (!proof) {
      return null;
    }

    return {
      id: proof.id,
      documentType: proof.documentType,
      originalName: proof.originalName,
      mimeType: proof.mimeType,
      size: proof.size,
      uploadedAt: proof.uploadedAt,
    };
  }
}

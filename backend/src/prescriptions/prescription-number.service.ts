import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { nextDocumentNumber } from '../common/utils/clinical-document-number';

// ORD-<year>-<NNNNNN>, sequential within the year (PRESCRIPTION sequence),
// taken in the transaction that validates the prescription.
@Injectable()
export class PrescriptionNumberService {
  next(
    transaction: Prisma.TransactionClient,
    at = new Date(),
  ): Promise<string> {
    return nextDocumentNumber(transaction, {
      at,
      prefix: 'ORD',
      type: 'PRESCRIPTION',
    });
  }
}

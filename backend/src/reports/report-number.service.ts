import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { nextDocumentNumber } from '../common/utils/clinical-document-number';

// CR-<year>-<NNNNNN>, sequential within the year (CLINICAL_REPORT sequence),
// taken in the transaction that finalizes the report: a rolled-back
// finalization gives its number back.
@Injectable()
export class ReportNumberService {
  next(
    transaction: Prisma.TransactionClient,
    at = new Date(),
  ): Promise<string> {
    return nextDocumentNumber(transaction, {
      at,
      prefix: 'CR',
      type: 'CLINICAL_REPORT',
    });
  }
}

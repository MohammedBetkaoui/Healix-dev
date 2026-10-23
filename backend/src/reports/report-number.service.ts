import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

const TIME_ZONE = 'Africa/Algiers';

// CR-<year>-<NNNNNN>, sequential within the year (CLINICAL_REPORT sequence),
// taken in the transaction that finalizes the report: a rolled-back
// finalization gives its number back.
@Injectable()
export class ReportNumberService {
  async next(
    transaction: Prisma.TransactionClient,
    at = new Date(),
  ): Promise<string> {
    const year = Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
      }).format(at),
    );
    const sequence = await transaction.clinicalDocumentSequence.upsert({
      where: { type_year: { type: 'CLINICAL_REPORT', year } },
      create: { type: 'CLINICAL_REPORT', year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
    return `CR-${year}-${String(sequence.lastValue).padStart(6, '0')}`;
  }
}

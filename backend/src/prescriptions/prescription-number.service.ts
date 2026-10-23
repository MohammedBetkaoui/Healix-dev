import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

const TIME_ZONE = 'Africa/Algiers';

@Injectable()
export class PrescriptionNumberService {
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
      where: { type_year: { type: 'PRESCRIPTION', year } },
      create: { type: 'PRESCRIPTION', year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
    return `ORD-${year}-${String(sequence.lastValue).padStart(6, '0')}`;
  }
}

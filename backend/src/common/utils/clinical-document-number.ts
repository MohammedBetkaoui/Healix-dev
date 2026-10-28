import { type Prisma } from '@prisma/client';

const TIME_ZONE = 'Africa/Algiers';

// The kinds of document numbered by clinical_document_sequences: one counter
// per (type, year). The AI reports (CR-IA-...) have their own numbering.
export type ClinicalDocumentType = 'CLINICAL_REPORT' | 'PRESCRIPTION';

/** The year of a number: the one of the calendar of Algeria. */
export function numberingYear(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
    }).format(at),
  );
}

// The next value of the counter of this type and year, taken in the
// caller's transaction (a rolled-back transaction gives its number back).
//
// One INSERT ... ON DUPLICATE KEY UPDATE creates the counter at 1 or adds 1
// to it, and waits for the transaction that holds it: the first number of a
// year is taken by several requests at once without any of them failing. A
// find-or-create done in two steps (Prisma's upsert) would let two requests
// both create the row: one of them fails on the unique (type, year), and
// retrying cannot work either, as the snapshot of its transaction does not
// see the row the other one just committed.
//
// The value is then read back in the same transaction, which sees its own
// update and holds the row until it commits: two documents never share a
// number.
export async function nextSequenceValue(
  transaction: Prisma.TransactionClient,
  type: ClinicalDocumentType,
  year: number,
): Promise<number> {
  // `last_value` is quoted: MySQL 8.0+ reserves LAST_VALUE (window
  // function), and an unquoted column of that name dies with error 1064.
  await transaction.$executeRaw`
    INSERT INTO \`clinical_document_sequences\` (\`id\`, \`type\`, \`year\`, \`last_value\`)
    VALUES (UUID(), ${type}, ${year}, 1)
    ON DUPLICATE KEY UPDATE \`last_value\` = \`last_value\` + 1`;
  const rows = await transaction.$queryRaw<Array<{ last_value: number }>>`
    SELECT \`last_value\` FROM \`clinical_document_sequences\`
    WHERE \`type\` = ${type} AND \`year\` = ${year}`;

  return Number(rows[0].last_value);
}

// <prefix>-<year>-<NNNNNN>, sequential within the year.
export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  options: { at: Date; prefix: string; type: ClinicalDocumentType },
): Promise<string> {
  const year = numberingYear(options.at);
  const value = await nextSequenceValue(transaction, options.type, year);

  return `${options.prefix}-${year}-${String(value).padStart(6, '0')}`;
}

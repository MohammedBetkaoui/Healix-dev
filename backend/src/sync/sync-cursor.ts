import { BadRequestException } from '@nestjs/common';

export const encodeSyncCursor = (sequence: bigint) =>
  Buffer.from(
    JSON.stringify({ sequence: sequence.toString() }),
    'utf8',
  ).toString('base64url');

export const decodeSyncCursor = (cursor: string | undefined) => {
  if (!cursor) return 0n;
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { sequence?: unknown };
    if (
      typeof decoded.sequence !== 'string' ||
      !/^\d+$/.test(decoded.sequence)
    ) {
      throw new Error('invalid sequence');
    }
    return BigInt(decoded.sequence);
  } catch {
    throw new BadRequestException('Curseur de synchronisation invalide.');
  }
};

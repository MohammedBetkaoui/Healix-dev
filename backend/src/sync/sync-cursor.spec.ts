import { BadRequestException } from '@nestjs/common';

import { decodeSyncCursor, encodeSyncCursor } from './sync-cursor';

describe('sync cursor', () => {
  it('round-trips a bigint without exposing cursor semantics to the client', () => {
    const cursor = encodeSyncCursor(9_007_199_254_740_993n);

    expect(cursor).not.toContain('9007199254740993');
    expect(decodeSyncCursor(cursor)).toBe(9_007_199_254_740_993n);
  });

  it.each(['not-base64', Buffer.from('{}').toString('base64url')])(
    'rejects malformed cursor %s',
    (cursor) => {
      expect(() => decodeSyncCursor(cursor)).toThrow(BadRequestException);
    },
  );

  it('starts at sequence zero when no cursor is supplied', () => {
    expect(decodeSyncCursor(undefined)).toBe(0n);
  });
});

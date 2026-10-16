import { BadRequestException } from '@nestjs/common';

import {
  decodeCursor,
  directKeyFor,
  encodeCursor,
  previewOf,
} from './messaging-rules';

describe('directKeyFor', () => {
  it('is the same whoever opens the conversation', () => {
    expect(directKeyFor('user-b', 'user-a')).toBe('user-a:user-b');
    expect(directKeyFor('user-a', 'user-b')).toBe('user-a:user-b');
  });

  it('fits direct_key (64 characters) for two cuids', () => {
    expect(
      directKeyFor('cmgx1a2b3c4d5e6f7g8h9i0jk', 'cmgx9z8y7x6w5v4u3t2s1r0qp')
        .length,
    ).toBeLessThanOrEqual(64);
  });
});

describe('conversation cursor', () => {
  it('round-trips a date and an id, or no date', () => {
    const at = new Date('2026-10-16T08:30:00.123Z');
    expect(decodeCursor(encodeCursor({ id: 'c1', lastMessageAt: at }))).toEqual(
      { id: 'c1', lastMessageAt: at },
    );
    expect(
      decodeCursor(encodeCursor({ id: 'c2', lastMessageAt: null })),
    ).toEqual({ id: 'c2', lastMessageAt: null });
  });

  it.each([
    'not-base64-json',
    Buffer.from('["2026-10-16"]').toString('base64url'),
    Buffer.from('["not a date","c1"]').toString('base64url'),
    Buffer.from('[null,""]').toString('base64url'),
    Buffer.from('{"id":"c1"}').toString('base64url'),
  ])('refuses %p with 400', (value) => {
    expect(() => decodeCursor(value)).toThrow(BadRequestException);
  });
});

describe('previewOf', () => {
  it('keeps a short text, on one line', () => {
    expect(previewOf('  Avis  demandé\n\nIRM du 12/10 ')).toBe(
      'Avis demandé IRM du 12/10',
    );
  });

  it('cuts at 120 characters, ellipsis included, without splitting an emoji', () => {
    const preview = previewOf(`${'é'.repeat(118)}🩺🩺🩺`);
    expect(Array.from(preview)).toHaveLength(120);
    expect(preview).toBe(`${'é'.repeat(118)}🩺…`);
    expect(previewOf('x'.repeat(120))).toBe('x'.repeat(120));
  });
});

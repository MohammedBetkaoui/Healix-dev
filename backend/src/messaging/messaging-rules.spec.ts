import { BadRequestException } from '@nestjs/common';

import {
  attachmentNameOf,
  caseTitleFor,
  decodeCursor,
  detectAttachmentType,
  directKeyFor,
  encodeCursor,
  filedContentOf,
  previewOf,
  viewDayOf,
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

describe('detectAttachmentType', () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);

  it('reads PDF, PNG and JPEG from their first bytes', () => {
    expect(detectAttachmentType(Buffer.from('%PDF-1.7\n…', 'latin1'))).toBe(
      'application/pdf',
    );
    expect(detectAttachmentType(png)).toBe('image/png');
    expect(detectAttachmentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
  });

  it('refuses anything else, whatever its name: an executable, a page, an SVG', () => {
    // "MZ": a Windows executable, named radio.png by its sender.
    expect(
      detectAttachmentType(Buffer.from('MZ\x90\x00', 'latin1')),
    ).toBeNull();
    expect(detectAttachmentType(Buffer.from('<html><script>'))).toBeNull();
    expect(detectAttachmentType(Buffer.from('<svg xmlns="…">'))).toBeNull();
    // A signature cut short is not one.
    expect(detectAttachmentType(png.subarray(0, 4))).toBeNull();
    expect(detectAttachmentType(Buffer.alloc(0))).toBeNull();
  });
});

describe('attachmentNameOf', () => {
  it('keeps a name whose extension matches the content', () => {
    expect(attachmentNameOf('ECG du 12.pdf', 'application/pdf')).toBe(
      'ECG du 12.pdf',
    );
    expect(attachmentNameOf('cliché.JPEG', 'image/jpeg')).toBe('cliché.JPEG');
  });

  it('gives the extension of the content, and removes path characters', () => {
    expect(attachmentNameOf('scan.exe', 'application/pdf')).toBe('scan.pdf');
    expect(attachmentNameOf('../../etc/passwd', 'image/png')).toBe(
      '..-..-etc-passwd.png',
    );
    expect(attachmentNameOf('', 'image/jpeg')).toBe('document.jpg');
  });
});

describe('caseTitleFor', () => {
  it('names the discussion after the patient, last name in capitals', () => {
    expect(caseTitleFor({ firstName: 'Amina', lastName: 'Benali' })).toBe(
      'Cas — BENALI Amina',
    );
  });

  it('fits the title column (120 characters)', () => {
    const title = caseTitleFor({
      firstName: 'x'.repeat(100),
      lastName: 'y'.repeat(100),
    });
    expect(Array.from(title)).toHaveLength(120);
  });
});

describe('viewDayOf', () => {
  it('is the day in Algiers (UTC+1), not in UTC', () => {
    // 23:30 UTC is already the next day in Algiers.
    expect(viewDayOf(new Date('2026-10-17T23:30:00Z')).toISOString()).toBe(
      '2026-10-18T00:00:00.000Z',
    );
    expect(viewDayOf(new Date('2026-10-17T10:00:00Z')).toISOString()).toBe(
      '2026-10-17T00:00:00.000Z',
    );
  });
});

describe('filedContentOf', () => {
  it('files the text, then one line per attachment', () => {
    expect(
      filedContentOf('Avis : pas de contre-indication.', ['ECG.pdf']),
    ).toBe('Avis : pas de contre-indication.\n[Pièce jointe : ECG.pdf]');
    expect(filedContentOf(null, ['IRM.png'])).toBe('[Pièce jointe : IRM.png]');
    expect(filedContentOf(null, [])).toBe('');
  });
});

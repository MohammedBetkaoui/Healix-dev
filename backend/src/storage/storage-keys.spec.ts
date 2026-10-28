import { createStorageKey, isStorageKey, storageKeyPrefixOf } from './storage-keys';

describe('createStorageKey', () => {
  it.each([
    ['MEDICAL_SENSITIVE', 'medical'],
    ['VERIFICATION_SENSITIVE', 'verification'],
    ['PUBLIC', 'public'],
    ['PRIVATE', 'private'],
    ['TEMPORARY', 'temp'],
  ] as const)('keys a %s file under its namespace', (classification, namespace) => {
    const key = createStorageKey(classification);

    expect(key).toMatch(
      new RegExp(`^hx/${namespace}/[0-9a-f]{2}/[0-9a-f]{32}\\.bin$`),
    );
  });

  it('says nothing about the file: no original name, no identity, no extension of the caller', () => {
    // The key never carries the pieces a path must not reveal: the name of
    // the file, the person or the document it belongs to.
    const key = createStorageKey('MEDICAL_SENSITIVE');

    expect(key.startsWith('hx/medical/')).toBe(true);
    expect(key).not.toMatch(/[A-Z]/);
  });
});

describe('isStorageKey', () => {
  it('tells a modern key from a legacy path (the `hx/` prefix is the discriminator)', () => {
    expect(isStorageKey('hx/medical/ab/ab12.bin')).toBe(true);
    expect(isStorageKey('patients/patient-1/documents/doc.pdf')).toBe(false);
    expect(isStorageKey('verifications/123/report.jpg')).toBe(false);
    expect(isStorageKey('payments/pay-1/proof.pdf')).toBe(false);
    expect(isStorageKey('messaging/conv-1/att.bin')).toBe(false);
  });
});

describe('storageKeyPrefixOf', () => {
  it('answers the folder that holds the object (for grouped artifacts)', () => {
    expect(storageKeyPrefixOf('hx/medical/ab/' + 'c'.repeat(32) + '.bin')).toBe(
      'hx/medical/ab/',
    );
  });
});

import { randomBytes } from 'node:crypto';

import { type StorageClassification } from './storage.types';

// The storage keys. A key says nothing about the file it holds: no patient or
// doctor name, no NIN, no email, no original file name — 16 random bytes in
// a folder of their first byte, under the namespace of their classification.
// The original name lives in the document's row only, and is used at download
// time for the Content-Disposition header.
//
// The `hx/` prefix is the discriminator between a modern reference and a
// legacy path read from a row that the migration script has not visited yet:
// the legacy paths start with `patients/`, `verifications/`, `payments/` or
// `messaging/`, never with `hx/`.

export const STORAGE_KEY_PREFIX = 'hx/';

const NAMESPACE_BY_CLASSIFICATION: Record<StorageClassification, string> = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  MEDICAL_SENSITIVE: 'medical',
  VERIFICATION_SENSITIVE: 'verification',
  TEMPORARY: 'temp',
};

const KEY_BYTES = 16;

export function isStorageKey(reference: string): boolean {
  return reference.startsWith(STORAGE_KEY_PREFIX);
}

// hx/<namespace>/<aa>/<32 hex>.bin — e.g. hx/medical/8f/8f6f0c1d....bin
export function createStorageKey(classification: StorageClassification): string {
  const namespace = NAMESPACE_BY_CLASSIFICATION[classification];

  if (!namespace) {
    throw new Error(`Unknown storage classification: ${classification}`);
  }

  const hex = randomBytes(KEY_BYTES).toString('hex');

  return `${STORAGE_KEY_PREFIX}${namespace}/${hex.slice(0, 2)}/${hex}.bin`;
}

// The prefix that holds a whole group of objects (the images of a volumetry):
// the key of the folder, without its last segment.
export function storageKeyPrefixOf(storageKey: string): string {
  const withoutFile = storageKey.slice(
    0,
    storageKey.length - storageKey.split('/').at(-1)!.length,
  );

  return withoutFile;
}

// The reference a document row holds: its modern opaque key first, then the
// legacy path it was created with (null when the migration script has not
// moved it and it predates the modern storage — a row without any reference
// has no file behind it).
export function storageReferenceOf(row: {
  filePath?: string | null;
  localPath?: string | null;
  storageKey?: string | null;
}): string | null {
  return row.storageKey ?? row.localPath ?? row.filePath ?? null;
}

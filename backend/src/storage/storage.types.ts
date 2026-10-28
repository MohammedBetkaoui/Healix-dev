import { type Readable } from 'node:stream';

// How sensitive a file is, decided by the business service that stores it —
// an upload is not medical by default (the payments proofs are financial
// documents, a verification piece is administrative). The sensitive classes
// are encrypted before they reach the storage (local or S3); the others only
// get a private location with an opaque key.
export type StorageClassification =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'MEDICAL_SENSITIVE'
  | 'VERIFICATION_SENSITIVE'
  | 'TEMPORARY';

// The classes encrypted at rest (AES-256-GCM) before they leave the process.
export const ENCRYPTED_CLASSIFICATIONS: ReadonlySet<StorageClassification> =
  new Set(['MEDICAL_SENSITIVE', 'VERIFICATION_SENSITIVE']);

export type PutObjectInput = {
  // The file as it was read or generated. Today's uploads are held in memory
  // under multer's per-route limits (5 to 20 MiB, 512 MiB for the DICOM
  // import that does not come through here); put/get stay Buffer-based
  // until a workflow needs a streaming upload, and reads already stream.
  data: Buffer;
  classification: StorageClassification;
  mimeType: string;
  // Metadata only: kept in the document's row, never part of the storage key.
  originalFileName?: string;
};

// What the caller stores in its document's row: the opaque key and the
// metadata the download routes reuse (headers, integrity checks).
export type StoredObject = {
  storageKey: string;
  mimeType: string;
  // The size and the checksum are those of the original file, not of the
  // ciphertext.
  size: number;
  sha256: string;
  // 1 (AES-256-GCM) when the file is encrypted, null when it is stored clear.
  encryptionVersion: number | null;
};

// The raw bytes contract of a storage backend. StorageService applies the
// encryption around the adapter: no adapter ever receives a plaintext
// sensitive file, and no adapter knows about the users or the documents.
export interface StorageAdapter {
  // Writes the exact bytes. The key is unique (hx/...), so an existing object
  // is never a legitimate write: the adapters refuse to overwrite one.
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  // The whole object.
  read(key: string): Promise<Buffer>;
  // The bytes from `start` on, for a decrypt-through read that never holds a
  // whole file in memory.
  open(key: string, start?: number): Promise<Readable>;
  // The first `length` bytes, to read the format header before streaming.
  readSlice(key: string, length: number): Promise<Buffer>;
  // Removes the object when it exists, without failing when it does not.
  delete(key: string): Promise<void>;
  // A group of objects stored under `prefix` (the images of a volumetry).
  deletePrefix(prefix: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// A reference held in a document's row: either a modern opaque storage key
// (hx/...) or, during the transition, the legacy path of a file that a
// migration script has not moved yet.
export type StorageReference = string;

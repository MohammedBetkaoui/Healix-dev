// The type of an upload read from its first bytes: neither its name nor the
// type the browser declared count. null for anything else (an executable
// named .pdf, an HTML page, an SVG...). Shared by the uploads that accept
// these types (verification documents, messaging attachments): the storage
// never trusts file.mimetype alone.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');

export type UploadableMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

const SIGNATURES: readonly [UploadableMimeType, Buffer][] = [
  ['application/pdf', PDF_SIGNATURE],
  ['image/png', PNG_SIGNATURE],
  ['image/jpeg', JPEG_SIGNATURE],
];

// The types whose declared value this util is able to confirm (or refute) by
// magic bytes. An upload declared with one of them must hold them; an upload
// declared with another type cannot be checked here.
export const RECOGNIZABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export function detectRealFileType(buffer: Buffer): UploadableMimeType | null {
  const startsWith = (signature: Buffer) =>
    buffer.length >= signature.length &&
    buffer.subarray(0, signature.length).equals(signature);

  for (const [mimeType, signature] of SIGNATURES) {
    if (startsWith(signature)) return mimeType;
  }

  return null;
}

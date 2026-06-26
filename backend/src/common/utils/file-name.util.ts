import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';

const dangerousExtensions = new Set([
  '.bat',
  '.cmd',
  '.exe',
  '.html',
  '.js',
  '.php',
  '.ps1',
  '.sh',
  '.svg',
]);

const allowedExtensionsByMimeType = new Map<string, string[]>([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
]);

export function sanitizeOriginalFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 180) || 'document';
}

export function getSafeFileExtension(
  originalName: string,
  mimeType: string,
): string | null {
  const extension = extname(originalName).toLowerCase();

  if (!extension || dangerousExtensions.has(extension)) {
    return null;
  }

  const allowedExtensions = allowedExtensionsByMimeType.get(mimeType);

  if (!allowedExtensions?.includes(extension)) {
    return null;
  }

  return extension;
}

export function createStoredVerificationFileName(
  documentType: string,
  extension: string,
): string {
  const randomPart = randomBytes(6).toString('hex');
  return `${documentType}_${Date.now()}_${randomPart}${extension}`;
}

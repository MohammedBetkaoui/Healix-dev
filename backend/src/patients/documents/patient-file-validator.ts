import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'node:path';

// Own MIME->extension map (distinct from verification-file-validator.ts):
// patient documents also accept DICOM, which verification documents never
// do. Browsers very commonly send an empty mimetype for .dcm uploads (DICOM
// has no browser-registered MIME type), so a .dcm file with no mimetype is
// accepted on the strength of its extension alone, on top of the normal
// MIME-based check below.
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
  ['application/dicom', ['.dcm']],
]);

function isDicomExtensionWithoutMimeType(
  originalName: string,
  mimeType: string,
): boolean {
  return !mimeType && extname(originalName).toLowerCase() === '.dcm';
}

function getSafePatientDocumentExtension(
  originalName: string,
  mimeType: string,
): string | null {
  const extension = extname(originalName).toLowerCase();

  if (!extension || dangerousExtensions.has(extension)) {
    return null;
  }

  if (isDicomExtensionWithoutMimeType(originalName, mimeType)) {
    return extension;
  }

  const allowedExtensions = allowedExtensionsByMimeType.get(mimeType);

  if (!allowedExtensions?.includes(extension)) {
    return null;
  }

  return extension;
}

@Injectable()
export class PatientFileValidator {
  private readonly allowedMimeTypes: Set<string>;
  private readonly maxSizeBytes: number;

  constructor(configService: ConfigService) {
    const allowedTypes =
      configService.get<string>('ALLOWED_PATIENT_DOCUMENT_FILE_TYPES') ??
      'application/pdf,image/jpeg,image/png,application/dicom';
    const maxSizeMb = Number(
      configService.get<string>('MAX_PATIENT_DOCUMENT_FILE_SIZE_MB') ?? '20',
    );

    this.allowedMimeTypes = new Set(
      allowedTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    this.maxSizeBytes = Number.isFinite(maxSizeMb)
      ? maxSizeMb * 1024 * 1024
      : 20 * 1024 * 1024;
  }

  validate(file: Express.Multer.File): string {
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException('Fichier trop volumineux.');
    }

    const isDicomFallback = isDicomExtensionWithoutMimeType(
      file.originalname,
      file.mimetype,
    );

    if (!isDicomFallback && !this.allowedMimeTypes.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Format de fichier non accepté.',
      );
    }

    const extension = getSafePatientDocumentExtension(
      file.originalname,
      file.mimetype,
    );

    if (!extension) {
      throw new UnsupportedMediaTypeException(
        'Format de fichier non accepté.',
      );
    }

    return extension;
  }
}

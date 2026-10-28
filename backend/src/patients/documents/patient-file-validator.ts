import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'node:path';

import { PatientDocumentType } from '../../common/enums/patient-document-type.enum';
import {
  detectRealFileType,
  RECOGNIZABLE_MIME_TYPES,
} from '../../common/utils/file-type.util';

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

// ECG signals (ECG_SIGNAL documents only, never another type): CSV/TXT text,
// or a WFDB record zipped. Browsers send a CSV as text/csv, text/plain or,
// on Windows with Excel installed, application/vnd.ms-excel; a zip as
// application/zip or application/x-zip-compressed. Stored under one MIME
// type per extension.
const ECG_MIME_TYPES_BY_EXTENSION = new Map<string, string[]>([
  ['.csv', ['text/csv', 'application/vnd.ms-excel', 'text/plain']],
  ['.txt', ['text/plain', 'text/csv']],
  ['.zip', ['application/zip', 'application/x-zip-compressed']],
]);
const ECG_STORED_MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};
// Local file header of a zip archive.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type ValidatedPatientFile = {
  extension: string;
  /** The MIME type to store (one per extension for an ECG signal). */
  mimeType: string;
};

const unsupported = () =>
  new UnsupportedMediaTypeException('Format de fichier non accepté.');

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

  validate(
    file: Express.Multer.File,
    documentType: PatientDocumentType,
  ): ValidatedPatientFile {
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException('Fichier trop volumineux.');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (documentType === PatientDocumentType.ECG_SIGNAL) {
      return validateEcgSignal(file, extension);
    }
    // A signal file is an ECG_SIGNAL document, whatever the configuration.
    if (ECG_MIME_TYPES_BY_EXTENSION.has(extension)) {
      throw unsupported();
    }

    const isDicomFallback = isDicomExtensionWithoutMimeType(
      file.originalname,
      file.mimetype,
    );

    if (!isDicomFallback && !this.allowedMimeTypes.has(file.mimetype)) {
      throw unsupported();
    }

    // The type the browser declared is not trusted: for the types this check
    // can recognize, the first bytes must hold their signature too (a
    // document.pdf that is an executable, an HTML page or an SVG is
    // refused).
    if (RECOGNIZABLE_MIME_TYPES.has(file.mimetype)) {
      if (detectRealFileType(file.buffer) !== file.mimetype) {
        throw unsupported();
      }
    }

    const safeExtension = getSafePatientDocumentExtension(
      file.originalname,
      file.mimetype,
    );

    if (!safeExtension) {
      throw unsupported();
    }

    return { extension: safeExtension, mimeType: file.mimetype };
  }
}

// The content is checked too: a zip starts with its signature, a text file
// holds no NUL byte (a binary renamed .csv).
function validateEcgSignal(
  file: Express.Multer.File,
  extension: string,
): ValidatedPatientFile {
  const mimeTypes = ECG_MIME_TYPES_BY_EXTENSION.get(extension);
  if (!mimeTypes?.includes(file.mimetype)) {
    throw unsupported();
  }

  const content = file.buffer ?? Buffer.alloc(0);
  const valid =
    extension === '.zip'
      ? content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)
      : content.length > 0 && !content.includes(0);
  if (!valid) {
    throw unsupported();
  }

  return { extension, mimeType: ECG_STORED_MIME_TYPES[extension] };
}

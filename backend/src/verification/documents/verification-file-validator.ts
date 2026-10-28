import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getSafeFileExtension } from '../../common/utils/file-name.util';
import {
  detectRealFileType,
  RECOGNIZABLE_MIME_TYPES,
} from '../../common/utils/file-type.util';

@Injectable()
export class VerificationFileValidator {
  private readonly allowedMimeTypes: Set<string>;
  private readonly maxSizeBytes: number;

  constructor(configService: ConfigService) {
    const allowedTypes =
      configService.get<string>('ALLOWED_VERIFICATION_FILE_TYPES') ??
      'application/pdf,image/jpeg,image/png';
    const maxSizeMb = Number(
      configService.get<string>('MAX_VERIFICATION_FILE_SIZE_MB') ?? '5',
    );

    this.allowedMimeTypes = new Set(
      allowedTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    this.maxSizeBytes = Number.isFinite(maxSizeMb)
      ? maxSizeMb * 1024 * 1024
      : 5 * 1024 * 1024;
  }

  validate(file: Express.Multer.File): string {
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException('Fichier trop volumineux.');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Format de fichier non accepté.');
    }

    // The type the browser declared is not trusted: for the types this check
    // can recognize, the first bytes must hold their signature too (a
    // document.jpg that is an executable, an HTML page or an SVG is
    // refused).
    if (RECOGNIZABLE_MIME_TYPES.has(file.mimetype)) {
      if (detectRealFileType(file.buffer) !== file.mimetype) {
        throw new UnsupportedMediaTypeException(
          'Le contenu du fichier ne correspond pas au type déclaré.',
        );
      }
    }

    const extension = getSafeFileExtension(file.originalname, file.mimetype);

    if (!extension) {
      throw new UnsupportedMediaTypeException('Format de fichier non accepté.');
    }

    return extension;
  }
}

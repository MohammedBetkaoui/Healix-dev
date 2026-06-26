import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getSafeFileExtension } from '../../common/utils/file-name.util';

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
      throw new UnsupportedMediaTypeException(
        'Format de fichier non accepté.',
      );
    }

    const extension = getSafeFileExtension(file.originalname, file.mimetype);

    if (!extension) {
      throw new UnsupportedMediaTypeException(
        'Format de fichier non accepté.',
      );
    }

    return extension;
  }
}

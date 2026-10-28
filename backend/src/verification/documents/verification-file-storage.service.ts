import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { sanitizeOriginalFileName } from '../../common/utils/file-name.util';
import { createStoredVerificationFileName } from '../../common/utils/file-name.util';
import { StorageService } from '../../storage/storage.service';

type StoreFileInput = {
  documentType: string;
  extension: string;
  file: Express.Multer.File;
  ownerId: string;
  ownerType: 'doctors' | 'establishments';
  verificationRequestId: string;
};

// What the row of the document keeps. The file itself lives in the
// StorageService under an opaque key (never the name of the file, of the
// owner or of the request): `storedName` stays a piece of metadata for the
// row and the name shown in the interfaces, `originalName` the name the user
// gave (reused, sanitized, in the Content-Disposition header at download).
// The verification pieces are classified VERIFICATION_SENSITIVE: they are
// encrypted (AES-256-GCM) before they reach the storage.
type StoredFileResult = {
  checksum: string;
  encryptionVersion: number | null;
  originalName: string;
  storageKey: string;
  storedName: string;
};

@Injectable()
export class VerificationFileStorageService {
  private readonly logger = new Logger(VerificationFileStorageService.name);

  constructor(private readonly storageService: StorageService) {}

  async storeVerificationFile(
    input: StoreFileInput,
  ): Promise<StoredFileResult> {
    const storedName = createStoredVerificationFileName(
      input.documentType,
      input.extension,
    );
    const originalName = sanitizeOriginalFileName(input.file.originalname);

    try {
      const stored = await this.storageService.put({
        classification: 'VERIFICATION_SENSITIVE',
        data: input.file.buffer,
        mimeType: input.file.mimetype,
        originalFileName: originalName,
      });

      return {
        checksum: stored.sha256,
        encryptionVersion: stored.encryptionVersion,
        originalName,
        storageKey: stored.storageKey,
        storedName,
      };
    } catch (error) {
      // The storage layer answers controlled errors (a write without a
      // master key, an unavailable storage); only the unexpected ones are
      // wrapped here.
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to store verification document.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du document.',
      );
    }
  }

  // The reference is either a modern storage key (hx/...) or the legacy path
  // of a document the migration script has not moved yet; both go through
  // the StorageService, which tells them apart.
  async deleteFile(reference: string): Promise<void> {
    try {
      await this.storageService.delete(reference);
    } catch (error) {
      this.logger.warn(
        'Failed to delete verification document from storage.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

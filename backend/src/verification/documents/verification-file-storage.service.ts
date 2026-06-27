import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createSha256Checksum } from '../../common/utils/checksum.util';
import {
  createStoredVerificationFileName,
  sanitizeOriginalFileName,
} from '../../common/utils/file-name.util';

type StoreFileInput = {
  documentType: string;
  extension: string;
  file: Express.Multer.File;
  ownerId: string;
  ownerType: 'doctors' | 'establishments';
  verificationRequestId: string;
};

type StoredFileResult = {
  checksum: string;
  localPath: string;
  originalName: string;
  storedName: string;
};

@Injectable()
export class VerificationFileStorageService {
  private readonly logger = new Logger(VerificationFileStorageService.name);
  private readonly uploadRoot: string;

  constructor(configService: ConfigService) {
    this.uploadRoot = resolve(
      process.cwd(),
      configService.get<string>('UPLOAD_ROOT') ?? './uploads',
    );
  }

  async storeVerificationFile(input: StoreFileInput): Promise<StoredFileResult> {
    const storedName = createStoredVerificationFileName(
      input.documentType,
      input.extension,
    );
    const targetDirectory = this.resolveSafePath(
      'verifications',
      input.ownerType,
      input.ownerId,
      input.verificationRequestId,
    );
    const localPath = this.resolveSafePath(
      'verifications',
      input.ownerType,
      input.ownerId,
      input.verificationRequestId,
      storedName,
    );

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(localPath, input.file.buffer);

      return {
        checksum: createSha256Checksum(input.file.buffer),
        localPath,
        originalName: sanitizeOriginalFileName(input.file.originalname),
        storedName,
      };
    } catch (error) {
      this.logger.error(
        'Failed to store verification document.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du document.',
      );
    }
  }

  async deleteLocalFile(localPath: string): Promise<void> {
    const safePath = this.ensurePathInsideUploadRoot(localPath);

    try {
      await rm(safePath, { force: true });
      await this.removeEmptyParentDirectories(dirname(safePath));
    } catch (error) {
      this.logger.warn(
        'Failed to delete verification document from disk.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private resolveSafePath(...segments: string[]) {
    return this.ensurePathInsideUploadRoot(resolve(this.uploadRoot, ...segments));
  }

  private ensurePathInsideUploadRoot(pathToCheck: string) {
    const resolvedPath = resolve(pathToCheck);

    if (
      resolvedPath !== this.uploadRoot &&
      !resolvedPath.startsWith(`${this.uploadRoot}\\`) &&
      !resolvedPath.startsWith(`${this.uploadRoot}/`)
    ) {
      throw new InternalServerErrorException('Chemin de fichier invalide.');
    }

    return resolvedPath;
  }

  private async removeEmptyParentDirectories(directory: string): Promise<void> {
    if (directory === this.uploadRoot || !directory.startsWith(this.uploadRoot)) {
      return;
    }

    try {
      await rm(directory, { recursive: false });
      await this.removeEmptyParentDirectories(dirname(directory));
    } catch {
      // Non-empty directories are expected and should be preserved.
    }
  }
}

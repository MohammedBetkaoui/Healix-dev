import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createSha256Checksum } from '../../common/utils/checksum.util';
import { sanitizeOriginalFileName } from '../../common/utils/file-name.util';

type StoreFileInput = {
  documentType: string;
  extension: string;
  file: Express.Multer.File;
  patientId: string;
};

type StoredFileResult = {
  checksum: string;
  localPath: string;
  originalName: string;
  storedName: string;
};

@Injectable()
export class PatientFileStorageService {
  private readonly logger = new Logger(PatientFileStorageService.name);
  private readonly uploadRoot: string;

  constructor(configService: ConfigService) {
    this.uploadRoot = resolve(
      process.cwd(),
      configService.get<string>('UPLOAD_ROOT') ?? './uploads',
    );
  }

  async storePatientDocument(
    input: StoreFileInput,
  ): Promise<StoredFileResult> {
    const storedName = this.createStoredFileName(
      input.documentType,
      input.extension,
    );
    const targetDirectory = this.resolveSafePath(
      'patients',
      input.patientId,
      'documents',
    );
    const localPath = this.resolveSafePath(
      'patients',
      input.patientId,
      'documents',
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
        'Failed to store patient document.',
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
        'Failed to delete patient document from disk.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private createStoredFileName(documentType: string, extension: string): string {
    const randomPart = randomBytes(6).toString('hex');
    return `${documentType}_${Date.now()}_${randomPart}${extension}`;
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

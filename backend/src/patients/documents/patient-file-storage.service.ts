import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, type ReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  async storePatientDocument(input: StoreFileInput): Promise<StoredFileResult> {
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

  // Read stream of a stored document. The path comes from the database, so it
  // is re-checked against the upload root before anything is opened.
  openStoredFile(localPath: string): ReadStream {
    const safePath = this.ensurePathInsideUploadRoot(localPath);

    if (!existsSync(safePath)) {
      throw new NotFoundException('Document introuvable.');
    }

    return createReadStream(safePath);
  }

  // Whole content of a stored document (an image sent for inference).
  async readStoredFile(localPath: string): Promise<Buffer> {
    const safePath = this.ensurePathInsideUploadRoot(localPath);

    if (!existsSync(safePath)) {
      throw new NotFoundException('Document introuvable.');
    }

    return readFile(safePath);
  }

  // Segmentation mask of an AI analysis run, next to the patient's documents:
  // patients/<patientId>/ai-masks/<runId>.png.
  async storeAiMask(input: {
    patientId: string;
    png: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    const targetDirectory = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-masks',
    );
    const localPath = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-masks',
      `${input.runId}.png`,
    );

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(localPath, input.png);

      return { checksum: createSha256Checksum(input.png), localPath };
    } catch (error) {
      this.logger.error(
        'Failed to store an AI segmentation mask.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du masque.',
      );
    }
  }

  // PDF report of an AI analysis run:
  // patients/<patientId>/ai-reports/<reportNumber>-<random>.pdf. The random
  // part keeps two simultaneous generations from writing the same file.
  async storeAiReport(input: {
    patientId: string;
    pdf: Buffer;
    reportNumber: string;
  }): Promise<{ checksum: string; localPath: string }> {
    const targetDirectory = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-reports',
    );
    const localPath = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-reports',
      `${input.reportNumber}-${randomBytes(4).toString('hex')}.pdf`,
    );

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(localPath, input.pdf, { flag: 'wx' });

      return { checksum: createSha256Checksum(input.pdf), localPath };
    } catch (error) {
      this.logger.error(
        'Failed to store an AI analysis report.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du compte rendu.',
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

  private createStoredFileName(
    documentType: string,
    extension: string,
  ): string {
    const randomPart = randomBytes(6).toString('hex');
    return `${documentType}_${Date.now()}_${randomPart}${extension}`;
  }

  private resolveSafePath(...segments: string[]) {
    return this.ensurePathInsideUploadRoot(
      resolve(this.uploadRoot, ...segments),
    );
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
    if (
      directory === this.uploadRoot ||
      !directory.startsWith(this.uploadRoot)
    ) {
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

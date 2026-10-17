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
import { dirname } from 'node:path';

import { createSha256Checksum } from '../../common/utils/checksum.util';
import { sanitizeOriginalFileName } from '../../common/utils/file-name.util';
import { UploadRoot } from '../../common/utils/upload-root';

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
  private readonly root: UploadRoot;
  private readonly uploadRoot: string;

  constructor(configService: ConfigService) {
    this.root = new UploadRoot(configService.get<string>('UPLOAD_ROOT'));
    this.uploadRoot = this.root.path;
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
  storeAiMask(input: {
    patientId: string;
    png: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    return this.storeAiImage(input, `${input.runId}.png`, {
      log: 'Failed to store an AI segmentation mask.',
      message: 'Une erreur est survenue lors du stockage du masque.',
    });
  }

  // Colour overlay of a nuclei segmentation, next to its label map:
  // patients/<patientId>/ai-masks/<runId>-overlay.png.
  storeAiOverlay(input: {
    patientId: string;
    png: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    return this.storeAiImage(input, `${input.runId}-overlay.png`, {
      log: 'Failed to store an AI segmentation overlay.',
      message: 'Une erreur est survenue lors du stockage de la superposition.',
    });
  }

  private async storeAiImage(
    input: { patientId: string; png: Buffer },
    fileName: string,
    failure: { log: string; message: string },
  ): Promise<{ checksum: string; localPath: string }> {
    const targetDirectory = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-masks',
    );
    const localPath = this.resolveSafePath(
      'patients',
      input.patientId,
      'ai-masks',
      fileName,
    );

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(localPath, input.png);

      return { checksum: createSha256Checksum(input.png), localPath };
    } catch (error) {
      this.logger.error(
        failure.log,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(failure.message);
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
    return this.root.resolve(...segments);
  }

  private ensurePathInsideUploadRoot(pathToCheck: string) {
    return this.root.ensureInside(pathToCheck);
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

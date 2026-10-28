import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Readable } from 'node:stream';

import { createSha256Checksum } from '../../common/utils/checksum.util';
import { sanitizeOriginalFileName } from '../../common/utils/file-name.util';
import { UploadRoot } from '../../common/utils/upload-root';
import { StorageService } from '../../storage/storage.service';

// <kind>-<ed|es>-<slice>.png: the only names a volumetry folder holds.
const VOLUMETRY_IMAGE_NAME = /^(?:label|slice)-(?:ed|es)-\d{3}\.png$/;

type StoreFileInput = {
  documentType: string;
  extension: string;
  file: Express.Multer.File;
  patientId: string;
};

// What the row of a document keeps: the key of its file in the
// StorageService (opaque), the version of the format it was written with,
// the checksum of the original, and the two names. A patient document is
// classified MEDICAL_SENSITIVE: it is encrypted (AES-256-GCM) before it
// reaches the storage.
type StoredFileResult = {
  checksum: string;
  encryptionVersion: number | null;
  originalName: string;
  storageKey: string;
  storedName: string;
};

@Injectable()
export class PatientFileStorageService {
  private readonly logger = new Logger(PatientFileStorageService.name);
  private readonly root: UploadRoot;

  constructor(
    configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.root = new UploadRoot(configService.get<string>('UPLOAD_ROOT'));
  }

  async storePatientDocument(input: StoreFileInput): Promise<StoredFileResult> {
    const storedName = this.createStoredFileName(
      input.documentType,
      input.extension,
    );
    const originalName = sanitizeOriginalFileName(input.file.originalname);

    try {
      const stored = await this.storageService.put({
        classification: 'MEDICAL_SENSITIVE',
        data: input.file.buffer,
        mimeType: input.file.mimetype || 'application/octet-stream',
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
      // The storage layer answers controlled errors; only the unexpected
      // ones are wrapped here.
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to store patient document.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du document.',
      );
    }
  }

  // Read stream of a stored document. The reference comes from the database
  // (a modern key, or the legacy path of one not migrated yet), and the
  // storage re-checks it before anything is opened.
  openStoredFile(reference: string): Promise<Readable> {
    return this.storageService.getStream(reference);
  }

  // Whole content of a stored document (an image sent for inference).
  async readStoredFile(reference: string): Promise<Buffer> {
    return this.storageService.getBuffer(reference);
  }

  // Segmentation mask of an AI analysis run, next to the patient's documents:
  // patients/<patientId>/ai-masks/<runId>.png. (An artifact of the AI
  // pipeline, generated server-side, under UPLOAD_ROOT — see
  // docs/storage-security.md for what stays there.)
  storeAiMask(input: {
    patientId: string;
    png: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    return this.storeAiFile(input.patientId, input.png, `${input.runId}.png`, {
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
    return this.storeAiFile(
      input.patientId,
      input.png,
      `${input.runId}-overlay.png`,
      {
        log: 'Failed to store an AI segmentation overlay.',
        message:
          'Une erreur est survenue lors du stockage de la superposition.',
      },
    );
  }

  // The slice a cardiac MRI segmentation analysed (8-bit PNG), next to its
  // class map: patients/<patientId>/ai-masks/<runId>-slice.png.
  storeAiSlice(input: {
    patientId: string;
    png: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    return this.storeAiFile(
      input.patientId,
      input.png,
      `${input.runId}-slice.png`,
      {
        log: 'Failed to store an AI MRI slice.',
        message: 'Une erreur est survenue lors du stockage de la coupe.',
      },
    );
  }

  // The ECG trace of a cardiology run (JSON, the first 10 s filtered), with
  // the other files of the runs: patients/<patientId>/ai-masks/<runId>-ecg-trace.json.
  storeAiEcgTrace(input: {
    patientId: string;
    json: Buffer;
    runId: string;
  }): Promise<{ checksum: string; localPath: string }> {
    return this.storeAiFile(
      input.patientId,
      input.json,
      `${input.runId}-ecg-trace.json`,
      {
        log: 'Failed to store an AI ECG trace.',
        message: 'Une erreur est survenue lors du stockage du tracé ECG.',
      },
    );
  }

  // The images of a cardiac cine volumetry (the class maps and the slices of the ED and
  // ES phases, one each per slice) in a folder of their own, written all or none:
  // patients/<patientId>/ai-masks/<runId>-volumetry/<name>. The folder is what the
  // run keeps; an image is read back by its name (readAiVolumetryImage).
  async storeAiVolumetryImages(input: {
    images: { name: string; png: Buffer }[];
    patientId: string;
    runId: string;
  }): Promise<{ localPath: string }> {
    const localPath = this.root.resolve(
      'patients',
      input.patientId,
      'ai-masks',
      `${input.runId}-volumetry`,
    );

    try {
      await mkdir(localPath, { recursive: true });
      for (const { name, png } of input.images) {
        if (!VOLUMETRY_IMAGE_NAME.test(name)) {
          throw new Error('Unexpected volumetry image name.');
        }
        await writeFile(this.root.resolve(localPath, name), png);
      }
      return { localPath };
    } catch (error) {
      await rm(localPath, { force: true, recursive: true }).catch(
        () => undefined,
      );
      this.logger.error(
        'Failed to store the images of a cardiac volumetry.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage des images.',
      );
    }
  }

  // One image of the folder of a volumetry; the name is checked, and the path made
  // of the folder (from the database) and the name is re-checked against the upload
  // root like any stored file.
  async readAiVolumetryImage(folder: string, name: string): Promise<Buffer> {
    if (!VOLUMETRY_IMAGE_NAME.test(name)) {
      throw new NotFoundException('Image introuvable.');
    }

    const safePath = this.root.ensureInside(this.root.resolve(folder, name));

    try {
      return await readFile(safePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Image introuvable.');
      }
      throw error;
    }
  }

  // The folder of a volumetry and everything in it.
  async deleteAiVolumetryImages(folder: string): Promise<void> {
    const safePath = this.root.ensureInside(folder);

    try {
      await rm(safePath, { force: true, recursive: true });
      await this.removeEmptyParentDirectories(dirname(safePath));
    } catch (error) {
      this.logger.warn(
        'Failed to delete the images of a cardiac volumetry from disk.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async storeAiFile(
    patientId: string,
    data: Buffer,
    fileName: string,
    failure: { log: string; message: string },
  ): Promise<{ checksum: string; localPath: string }> {
    const targetDirectory = this.root.resolve(
      'patients',
      patientId,
      'ai-masks',
    );
    const localPath = this.root.resolve(
      'patients',
      patientId,
      'ai-masks',
      fileName,
    );

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(localPath, data);

      return { checksum: createSha256Checksum(data), localPath };
    } catch (error) {
      this.logger.error(
        failure.log,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(failure.message);
    }
  }

  // PDF report of an AI analysis run, encrypted like any sensitive file: the
  // random key of the storage holds two simultaneous generations apart (each
  // write lands under its own key).
  async storeAiReport(input: {
    patientId: string;
    pdf: Buffer;
    reportNumber: string;
  }): Promise<{
    checksum: string;
    encryptionVersion: number | null;
    storageKey: string;
  }> {
    try {
      const stored = await this.storageService.put({
        classification: 'MEDICAL_SENSITIVE',
        data: input.pdf,
        mimeType: 'application/pdf',
        originalFileName: `${input.reportNumber}.pdf`,
      });

      return {
        checksum: stored.sha256,
        encryptionVersion: stored.encryptionVersion,
        storageKey: stored.storageKey,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to store an AI analysis report.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException(
        'Une erreur est survenue lors du stockage du compte rendu.',
      );
    }
  }

  // The reference is either a modern storage key (hx/...) or the legacy path
  // of a file the migration script has not moved yet; both go through the
  // StorageService, which tells them apart.
  async deleteFile(reference: string): Promise<void> {
    try {
      await this.storageService.delete(reference);
    } catch (error) {
      this.logger.warn(
        'Failed to delete patient document from storage.',
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

  private async removeEmptyParentDirectories(directory: string): Promise<void> {
    if (directory === this.root.path || !directory.startsWith(this.root.path)) {
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


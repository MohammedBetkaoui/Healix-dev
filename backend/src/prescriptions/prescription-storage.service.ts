import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { UploadRoot } from '../common/utils/upload-root';
import { StorageService } from '../storage/storage.service';

// The PDF of a validated prescription: written encrypted
// (MEDICAL_SENSITIVE) under an opaque key of the StorageService — the row
// keeps the key and the version of the format, and never a path. The
// reference a row holds is either a modern key (hx/...) or the legacy path
// of one not migrated yet; the reads and the removals tell the two apart
// the same way.
@Injectable()
export class PrescriptionStorageService {
  private readonly logger = new Logger(PrescriptionStorageService.name);
  private readonly root: UploadRoot;

  constructor(
    config: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.root = new UploadRoot(config.get<string>('UPLOAD_ROOT'));
  }

  async store(input: {
    patientId: string;
    prescriptionId: string;
    number: string;
    pdf: Buffer;
  }) {
    const storedName = `${input.number}-${randomBytes(5).toString('hex')}.pdf`;

    try {
      const stored = await this.storageService.put({
        classification: 'MEDICAL_SENSITIVE',
        data: input.pdf,
        mimeType: 'application/pdf',
        originalFileName: `${input.number}.pdf`,
      });

      return {
        storedName,
        storageKey: stored.storageKey,
        encryptionVersion: stored.encryptionVersion,
        size: input.pdf.length,
        checksum: stored.sha256,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Failed to store a prescription PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException({
        code: 'PRESCRIPTION_PDF_STORAGE_FAILED',
        message: "Le PDF de l'ordonnance n'a pas pu être archivé.",
      });
    }
  }

  async read(reference: string): Promise<Buffer> {
    try {
      return await this.storageService.getBuffer(reference);
    } catch (error) {
      // The old 404 of the legacy reads, for the prescriptions whose PDF is
      // still under UPLOAD_ROOT: same code, same message.
      if (
        error instanceof HttpException &&
        (error as unknown as { response?: { code?: string } }).response
          ?.code === 'FILE_NOT_FOUND'
      ) {
        throw new NotFoundException({
          code: 'PRESCRIPTION_DOCUMENT_NOT_FOUND',
          message: 'Document ordonnance introuvable.',
        });
      }

      throw error;
    }
  }

  async remove(reference: string): Promise<void> {
    try {
      await this.storageService.delete(reference);
    } catch (error) {
      this.logger.warn(
        'Failed to remove an uncommitted prescription PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

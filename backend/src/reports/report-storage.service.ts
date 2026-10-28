import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type Readable } from 'node:stream';

import { createSha256Checksum } from '../common/utils/checksum.util';
import { UploadRoot } from '../common/utils/upload-root';
import { StorageService } from '../storage/storage.service';

// The PDF of a written report: written encrypted (MEDICAL_SENSITIVE) under
// an opaque key of the StorageService — the row keeps the key and the
// version of the format, and never a path. The reference a row holds is
// either a modern key (hx/...) or the legacy path of one not migrated yet;
// the reads and the removals tell the two apart the same way.
@Injectable()
export class ReportStorageService {
  private readonly logger = new Logger(ReportStorageService.name);
  private readonly root: UploadRoot;

  constructor(
    config: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.root = new UploadRoot(config.get<string>('UPLOAD_ROOT'));
  }

  async store(input: {
    patientId: string;
    reportId: string;
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
        'Failed to store a report PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException({
        code: 'REPORT_PDF_STORAGE_FAILED',
        message: "Le PDF du rapport n'a pas pu être archivé.",
      });
    }
  }

  async read(reference: string): Promise<Buffer> {
    try {
      return await this.storageService.getBuffer(reference);
    } catch (error) {
      // The old 404 of the legacy reads, for the reports whose PDF is still
      // under UPLOAD_ROOT: same code, same message.
      if (
        error instanceof HttpException &&
        (error as unknown as { response?: { code?: string } }).response
          ?.code === 'FILE_NOT_FOUND'
      ) {
        throw new NotFoundException({
          code: 'REPORT_DOCUMENT_NOT_FOUND',
          message: 'Document du rapport introuvable.',
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
        'Failed to remove an uncommitted report PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

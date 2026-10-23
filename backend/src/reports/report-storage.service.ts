import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { createSha256Checksum } from '../common/utils/checksum.util';
import { UploadRoot } from '../common/utils/upload-root';

// The PDF of a written report:
// patients/<patient>/reports/<report>/<number>-<random>.pdf
@Injectable()
export class ReportStorageService {
  private readonly logger = new Logger(ReportStorageService.name);
  private readonly root: UploadRoot;

  constructor(config: ConfigService) {
    this.root = new UploadRoot(config.get<string>('UPLOAD_ROOT'));
  }

  async store(input: {
    patientId: string;
    reportId: string;
    number: string;
    pdf: Buffer;
  }) {
    const storedName = `${input.number}-${randomBytes(5).toString('hex')}.pdf`;
    const directory = this.root.resolve(
      'patients',
      input.patientId,
      'reports',
      input.reportId,
    );
    const localPath = this.root.resolve(
      'patients',
      input.patientId,
      'reports',
      input.reportId,
      storedName,
    );
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(localPath, input.pdf, { flag: 'wx' });
      return {
        storedName,
        localPath,
        size: input.pdf.length,
        checksum: createSha256Checksum(input.pdf),
      };
    } catch (error) {
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

  async read(localPath: string): Promise<Buffer> {
    const safePath = this.root.ensureInside(localPath);
    if (!existsSync(safePath)) {
      throw new NotFoundException({
        code: 'REPORT_DOCUMENT_NOT_FOUND',
        message: 'Document du rapport introuvable.',
      });
    }
    return readFile(safePath);
  }

  async remove(localPath: string): Promise<void> {
    try {
      await rm(this.root.ensureInside(localPath), { force: true });
    } catch (error) {
      this.logger.warn(
        'Failed to remove an uncommitted report PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

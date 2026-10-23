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

@Injectable()
export class PrescriptionStorageService {
  private readonly logger = new Logger(PrescriptionStorageService.name);
  private readonly root: UploadRoot;

  constructor(config: ConfigService) {
    this.root = new UploadRoot(config.get<string>('UPLOAD_ROOT'));
  }

  async store(input: {
    patientId: string;
    prescriptionId: string;
    number: string;
    pdf: Buffer;
  }) {
    const storedName = `${input.number}-${randomBytes(5).toString('hex')}.pdf`;
    const directory = this.root.resolve(
      'patients',
      input.patientId,
      'prescriptions',
      input.prescriptionId,
    );
    const localPath = this.root.resolve(
      'patients',
      input.patientId,
      'prescriptions',
      input.prescriptionId,
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
        'Failed to store a prescription PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new InternalServerErrorException({
        code: 'PRESCRIPTION_PDF_STORAGE_FAILED',
        message: "Le PDF de l'ordonnance n'a pas pu être archivé.",
      });
    }
  }

  async read(localPath: string): Promise<Buffer> {
    const safePath = this.root.ensureInside(localPath);
    if (!existsSync(safePath)) {
      throw new NotFoundException({
        code: 'PRESCRIPTION_DOCUMENT_NOT_FOUND',
        message: 'Document ordonnance introuvable.',
      });
    }
    return readFile(safePath);
  }

  async remove(localPath: string): Promise<void> {
    try {
      await rm(this.root.ensureInside(localPath), { force: true });
    } catch (error) {
      this.logger.warn(
        'Failed to remove an uncommitted prescription PDF.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import { type Observable, finalize } from 'rxjs';

import { DICOM_IMPORT_LIMITS } from './dicom-zip';

export const DICOM_UPLOAD_FIELD = 'files';

type RequestWithUploadDir = Request & { dicomUploadDir?: string };

// The files of an import (up to 512 MiB) wait on disk, not in memory, and are
// removed when the request ends, whatever way it ends (answered, refused,
// failed, or refused by multer before the handler ran). This interceptor is
// listed BEFORE FilesInterceptor so that it wraps it.
@Injectable()
export class DicomUploadDirInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithUploadDir>();
    const directory = await mkdtemp(join(tmpdir(), 'healixdz-dicom-'));
    request.dicomUploadDir = directory;

    return next.handle().pipe(
      finalize(() => {
        void rm(directory, { force: true, recursive: true }).catch(
          () => undefined,
        );
      }),
    );
  }
}

// multer: files on disk in the request's folder, under random names (the
// name sent by the client is only read, never used as a path).
export const dicomUploadStorage = diskStorage({
  destination: (request, _file, callback) => {
    const directory = (request as RequestWithUploadDir).dicomUploadDir;
    if (!directory) {
      callback(new Error('No upload folder for this request.'), '');
      return;
    }
    callback(null, directory);
  },
});

export const dicomUploadLimits = {
  fields: 10,
  fileSize: DICOM_IMPORT_LIMITS.maxUploadBytes,
  files: DICOM_IMPORT_LIMITS.maxFiles,
  parts: DICOM_IMPORT_LIMITS.maxFiles + 10,
};

import { InternalServerErrorException } from '@nestjs/common';
import { resolve } from 'node:path';

// The folder of the uploaded files (UPLOAD_ROOT, ./uploads by default), and
// the check that a path, often read back from the database, stays inside it
// before anything is opened, written or removed there.
export class UploadRoot {
  readonly path: string;

  constructor(configured: string | undefined) {
    this.path = resolve(process.cwd(), configured ?? './uploads');
  }

  resolve(...segments: string[]): string {
    return this.ensureInside(resolve(this.path, ...segments));
  }

  ensureInside(pathToCheck: string): string {
    const resolvedPath = resolve(pathToCheck);

    if (
      resolvedPath !== this.path &&
      !resolvedPath.startsWith(`${this.path}\\`) &&
      !resolvedPath.startsWith(`${this.path}/`)
    ) {
      throw new InternalServerErrorException('Chemin de fichier invalide.');
    }

    return resolvedPath;
  }
}

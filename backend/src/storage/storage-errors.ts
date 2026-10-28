import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

// The business errors of the storage layer. Their messages are the only thing
// a client sees: no filesystem path, no S3 endpoint or credentials, no
// cryptographic detail ever leaves the process.

export function fileNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'FILE_NOT_FOUND',
    message: 'Fichier introuvable.',
  });
}

export function fileTooLarge(maxBytes: number): BadRequestException {
  return new BadRequestException({
    code: 'FILE_TOO_LARGE',
    message: `Le fichier dépasse la taille maximale de ${Math.floor(maxBytes / (1024 * 1024))} Mo.`,
  });
}

export function fileTypeNotAllowed(): BadRequestException {
  return new BadRequestException({
    code: 'FILE_TYPE_NOT_ALLOWED',
    message: 'Le type réel du fichier ne correspond pas à un type autorisé.',
  });
}

// The ciphertext, its header or the master key did not agree: the file is
// not returned, not even partly (fail closed). The technical detail stays in
// the logs.
export function fileIntegrityFailed(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'FILE_INTEGRITY_FAILED',
    message:
      'Le fichier n’a pas pu être lu de manière fiable. Contactez le support.',
  });
}

export function storageUnavailable(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'STORAGE_UNAVAILABLE',
    message: 'Le stockage des fichiers est momentanément indisponible.',
  });
}

// A sensitive file was about to be stored without a valid master key: the
// write is refused rather than kept in clear text (fail closed).
export function storageNotConfigured(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'STORAGE_NOT_CONFIGURED',
    message:
      'Le stockage chiffré n’est pas configuré (STORAGE_MASTER_KEY absent ou invalide).',
  });
}

// An upload that carries no byte: refused before any storage happens.
export function fileEmpty(): BadRequestException {
  return new BadRequestException({
    code: 'FILE_EMPTY',
    message: 'Le fichier est vide.',
  });
}

// A random storage key that already holds an object: never a legitimate
// write (the keys are unique), the caller retries with a fresh key.
export class StorageKeyExistsError extends Error {
  constructor() {
    super('A file already exists under this storage key.');
    this.name = 'StorageKeyExistsError';
  }
}

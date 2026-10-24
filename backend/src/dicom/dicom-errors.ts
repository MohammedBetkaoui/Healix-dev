import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { OrthancError } from './orthanc.client';

// An object body is sent as-is by Nest's default exception filter, so the
// frontend reads response.data.code.

export const DICOM_UPLOAD_INVALID_CODE = 'DICOM_UPLOAD_INVALID';
export const DICOM_ZIP_UNSAFE_CODE = 'DICOM_ZIP_UNSAFE';
export const DICOM_NO_VALID_FILE_CODE = 'DICOM_NO_VALID_FILE';
export const DICOM_STORE_UNAVAILABLE_CODE = 'DICOM_STORE_UNAVAILABLE';

export type ZipRefusalReason =
  | 'CORRUPT'
  | 'ENCRYPTED'
  | 'NESTED_ZIP'
  | 'PATH'
  | 'TOO_LARGE'
  | 'TOO_MANY_FILES';

// An archive that cannot be imported as a whole.
export class DicomZipRefusal extends Error {
  constructor(readonly reason: ZipRefusalReason) {
    super(`ZIP refused: ${reason}`);
    this.name = 'DicomZipRefusal';
  }
}

export function dicomUploadInvalid(message: string) {
  return new BadRequestException({ code: DICOM_UPLOAD_INVALID_CODE, message });
}

export function dicomZipUnsafe(reason: ZipRefusalReason) {
  return new UnprocessableEntityException({
    code: DICOM_ZIP_UNSAFE_CODE,
    message:
      "Cette archive ZIP est refusée : chemins d'accès interdits, ZIP imbriqué, trop de fichiers, taille décompressée excessive ou archive corrompue.",
    reason,
  });
}

export function dicomNoValidFile(skipped: number) {
  return new UnprocessableEntityException({
    code: DICOM_NO_VALID_FILE_CODE,
    message: "Aucun fichier DICOM valide n'a été trouvé.",
    skipped,
  });
}

export function dicomStudyNotFound() {
  return new NotFoundException('Étude DICOM introuvable.');
}

export function dicomInstanceNotFound() {
  return new NotFoundException('Image DICOM introuvable.');
}

// What the caller sees of an Orthanc failure: a store that does not answer, or
// whose credentials are wrong, is a 502; an unknown resource is a 404.
export function fromOrthancError(
  error: unknown,
  notFound: () => Error = dicomInstanceNotFound,
): Error {
  if (error instanceof OrthancError) {
    if (error.kind === 'NOT_FOUND') {
      return notFound();
    }
    return new BadGatewayException({
      code: DICOM_STORE_UNAVAILABLE_CODE,
      message:
        "Le serveur d'imagerie DICOM ne répond pas. Réessayez plus tard.",
    });
  }
  return error instanceof Error ? error : new Error('Unknown error');
}

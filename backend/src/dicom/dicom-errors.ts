import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { CINE_STACK_LIMITS, type CineStackRefusal } from './cine-stacks';
import { OrthancError } from './orthanc.client';

// An object body is sent as-is by Nest's default exception filter, so the
// frontend reads response.data.code.

export const DICOM_UPLOAD_INVALID_CODE = 'DICOM_UPLOAD_INVALID';
export const DICOM_ZIP_UNSAFE_CODE = 'DICOM_ZIP_UNSAFE';
export const DICOM_NO_VALID_FILE_CODE = 'DICOM_NO_VALID_FILE';
export const DICOM_STORE_UNAVAILABLE_CODE = 'DICOM_STORE_UNAVAILABLE';
export const DICOM_PIPELINE_NOT_SUPPORTED_CODE = 'DICOM_PIPELINE_NOT_SUPPORTED';
export const DICOM_MULTIFRAME_NOT_SUPPORTED_CODE =
  'DICOM_MULTIFRAME_NOT_SUPPORTED';
export const DICOM_CINE_STACK_INVALID_CODE = 'DICOM_CINE_STACK_INVALID';

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

// The chain cannot read this slice: pathology and ECG chains read no DICOM
// slice (reason PIPELINE), and the others only read an MRI (reason MODALITY).
export function dicomPipelineNotSupported(
  pipeline: string,
  reason: 'MODALITY' | 'PIPELINE',
  modality: string | null = null,
) {
  return new UnprocessableEntityException({
    code: DICOM_PIPELINE_NOT_SUPPORTED_CODE,
    message:
      reason === 'PIPELINE'
        ? "Cette chaîne d'analyse ne lit pas une coupe DICOM : seules l'analyse cérébrale et la segmentation cardiaque le font."
        : "Seule une coupe d'IRM (modalité MR) peut être analysée.",
    modality,
    pipeline,
    reason,
  });
}

// One DICOM file holding a cine or a volume: the analysis reads one image.
export function dicomMultiframeNotSupported(frames: number) {
  return new UnprocessableEntityException({
    code: DICOM_MULTIFRAME_NOT_SUPPORTED_CODE,
    frames,
    message:
      "Cette instance DICOM contient plusieurs images (multi-frame) : choisissez une coupe d'une série d'images simples.",
  });
}

export function dicomSeriesNotFound() {
  return new NotFoundException('Série DICOM introuvable.');
}

const CINE_REFUSAL_MESSAGES: Record<CineStackRefusal, string> = {
  MIXED_ORIENTATION:
    "Les images de cette série n'ont pas toutes la même orientation : ce n'est pas une pile de coupes parallèles.",
  MULTIFRAME:
    'Cette série est faite de fichiers multi-image (multi-frame) : la volumétrie lit une série de fichiers à image unique.',
  TOO_FEW_SLICES: `Au moins ${CINE_STACK_LIMITS.minSlices} coupes sont nécessaires pour calculer des volumes.`,
  TOO_LARGE: 'Cette série dépasse la taille que le service peut analyser.',
  TOO_MANY_FILES: `Cette série compte plus de ${CINE_STACK_LIMITS.maxFiles} images.`,
  TOO_MANY_PHASES: `Une série ciné compte au plus ${CINE_STACK_LIMITS.maxPhases} phases.`,
  UNEQUAL_PHASES:
    "Toutes les coupes n'ont pas le même nombre de phases : la série est incomplète ou mélange plusieurs acquisitions.",
};

// The series is not a cine stack the analysis can read (reason says why), before
// anything is downloaded from the store.
export function dicomCineStackInvalid(refusal: CineStackRefusal) {
  return new UnprocessableEntityException({
    code: DICOM_CINE_STACK_INVALID_CODE,
    message: CINE_REFUSAL_MESSAGES[refusal],
    reason: refusal,
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

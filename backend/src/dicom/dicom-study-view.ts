import { type DicomStudy } from '@prisma/client';

import { type IdentityField, type IdentityWarning } from './dicom-identity';

// What the API says of an imported study (the row, in the shapes a browser
// reads: a number of bytes, a date, lists).
export type DicomStudyView = {
  createdAt: Date;
  id: string;
  identityWarnings: IdentityWarning[];
  instancesCount: number;
  modalities: string[];
  patientId: string;
  seriesCount: number;
  sizeBytes: number;
  studyDate: string | null;
  studyDescription: string | null;
  studyInstanceUid: string;
  uploadedById: string;
};

export type DicomImportWarning = {
  code: 'IDENTITY_MISMATCH' | 'STUDY_ATTACHED_TO_ANOTHER_PATIENT';
  fields?: IdentityField[];
  studyInstanceUid: string;
};

export type DicomImportResult = {
  imported: number;
  skipped: number;
  studies: DicomStudyView[];
  warnings: DicomImportWarning[];
};

const isString = (value: unknown): value is string => typeof value === 'string';

function toIdentityWarnings(value: unknown): IdentityWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is IdentityWarning =>
      item !== null &&
      typeof item === 'object' &&
      isString((item as IdentityWarning).field) &&
      isString((item as IdentityWarning).dicomValue),
  );
}

export function toDicomStudyView(row: DicomStudy): DicomStudyView {
  return {
    createdAt: row.createdAt,
    id: row.id,
    identityWarnings: toIdentityWarnings(row.identityWarnings),
    instancesCount: row.instancesCount,
    modalities: Array.isArray(row.modalities)
      ? row.modalities.filter(isString)
      : [],
    patientId: row.patientId,
    seriesCount: row.seriesCount,
    // A study stays far below 2^53 bytes.
    sizeBytes: Number(row.sizeBytes),
    studyDate: row.studyDate ? row.studyDate.toISOString().slice(0, 10) : null,
    studyDescription: row.studyDescription,
    studyInstanceUid: row.studyInstanceUid,
    uploadedById: row.uploadedById,
  };
}

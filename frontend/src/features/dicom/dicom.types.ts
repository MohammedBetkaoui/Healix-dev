// What /api/dicom/* answers (backend/src/dicom/dicom-study-view.ts and
// dicom-studies.service.ts).
export type DicomIdentityField = "PatientBirthDate" | "PatientName" | "PatientSex";

export type DicomIdentityWarning = {
  /** The value in the DICOM header, which the record does not have. */
  dicomValue: string;
  field: DicomIdentityField;
};

export type DicomStudy = {
  createdAt: string;
  id: string;
  identityWarnings: DicomIdentityWarning[];
  instancesCount: number;
  modalities: string[];
  patientId: string;
  seriesCount: number;
  sizeBytes: number;
  /** YYYY-MM-DD */
  studyDate: string | null;
  studyDescription: string | null;
  studyInstanceUid: string;
  uploadedById: string;
};

export type DicomInstance = {
  frames: number;
  /** Orthanc's identifier: what the preview takes. */
  id: string;
  instanceNumber: number | null;
  multiFrame: boolean;
  sopInstanceUid: string;
};

export type DicomSeries = {
  description: string | null;
  id: string;
  /** In the order of the stack. */
  instances: DicomInstance[];
  instancesCount: number;
  modality: string | null;
  number: number | null;
  seriesInstanceUid: string;
};

export type DicomStudyDetail = DicomStudy & { series: DicomSeries[] };

// GET /api/dicom/studies/:id/cine-stacks (backend/src/dicom/cine-stacks.ts): an MRI series with several
// phases at each slice position. A refusal says why the volumetry cannot read it.
export const cineStackRefusals = [
  "MIXED_ORIENTATION",
  "MULTIFRAME",
  "TOO_FEW_SLICES",
  "TOO_LARGE",
  "TOO_MANY_FILES",
  "TOO_MANY_PHASES",
  "UNEQUAL_PHASES",
] as const;
export type CineStackRefusal = (typeof cineStackRefusals)[number];

export type CineStack = {
  /** Orthanc's identifier of the series: what the measure takes. */
  seriesId: string;
  seriesInstanceUid: string;
  number: number | null;
  description: string | null;
  instances: number;
  /** Distinct positions along the stack. */
  slices: number;
  /** Images at each position. */
  phases: number;
  bytes: number;
  /** From the description of the series: true for a short axis, false for a long axis, null when it says nothing. */
  shortAxisLikely: boolean | null;
  refusal: CineStackRefusal | null;
};

export type DicomImportWarning = {
  code: "IDENTITY_MISMATCH" | "STUDY_ATTACHED_TO_ANOTHER_PATIENT";
  fields?: DicomIdentityField[];
  studyInstanceUid: string;
};

export type DicomImportResult = {
  imported: number;
  skipped: number;
  studies: DicomStudy[];
  warnings: DicomImportWarning[];
};

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

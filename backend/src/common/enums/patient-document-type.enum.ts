export const PatientDocumentType = {
  PRESCRIPTION: 'PRESCRIPTION',
  MEDICAL_REPORT: 'MEDICAL_REPORT',
  MEDICAL_IMAGE: 'MEDICAL_IMAGE',
  DICOM: 'DICOM',
  // A 12-lead ECG signal: CSV/TXT, or a WFDB record (.hea + .dat) zipped.
  ECG_SIGNAL: 'ECG_SIGNAL',
} as const;

export type PatientDocumentType =
  (typeof PatientDocumentType)[keyof typeof PatientDocumentType];

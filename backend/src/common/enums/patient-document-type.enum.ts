export const PatientDocumentType = {
  PRESCRIPTION: 'PRESCRIPTION',
  MEDICAL_REPORT: 'MEDICAL_REPORT',
  MEDICAL_IMAGE: 'MEDICAL_IMAGE',
  DICOM: 'DICOM',
} as const;

export type PatientDocumentType =
  (typeof PatientDocumentType)[keyof typeof PatientDocumentType];

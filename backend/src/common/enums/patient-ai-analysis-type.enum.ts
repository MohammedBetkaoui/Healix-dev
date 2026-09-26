export const PatientAiAnalysisType = {
  MRI: 'MRI',
  CT_SCAN: 'CT_SCAN',
  XRAY: 'XRAY',
  ECG: 'ECG',
} as const;

export type PatientAiAnalysisType =
  (typeof PatientAiAnalysisType)[keyof typeof PatientAiAnalysisType];

export const PatientAiAnalysisResult = {
  NORMAL: 'NORMAL',
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
} as const;

export type PatientAiAnalysisResult =
  (typeof PatientAiAnalysisResult)[keyof typeof PatientAiAnalysisResult];

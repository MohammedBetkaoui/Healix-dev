export const PatientConsentType = {
  HEALTH_DATA: 'HEALTH_DATA',
  DIAGNOSTIC_AI: 'DIAGNOSTIC_AI',
  RESEARCH: 'RESEARCH',
} as const;

export type PatientConsentType =
  (typeof PatientConsentType)[keyof typeof PatientConsentType];

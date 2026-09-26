export const PatientConsentStatus = {
  SIGNED: 'SIGNED',
  NOT_GRANTED: 'NOT_GRANTED',
} as const;

export type PatientConsentStatus =
  (typeof PatientConsentStatus)[keyof typeof PatientConsentStatus];

export const DoctorVerificationStep = {
  DOCUMENTS_SUBMISSION: 'DOCUMENTS_SUBMISSION',
  FISCAL_SOCIAL: 'FISCAL_SOCIAL',
  IDENTITY: 'IDENTITY',
  PRACTICE_LOCATION: 'PRACTICE_LOCATION',
  PROFESSIONAL_REGISTRATION: 'PROFESSIONAL_REGISTRATION',
  QUALIFICATION: 'QUALIFICATION',
} as const;

export type DoctorVerificationStep =
  (typeof DoctorVerificationStep)[keyof typeof DoctorVerificationStep];

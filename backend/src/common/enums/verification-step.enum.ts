export const VerificationStep = {
  DOCUMENTS: 'DOCUMENTS',
  ESTABLISHMENT_INFO: 'ESTABLISHMENT_INFO',
  HEALTH_AUTHORIZATION: 'HEALTH_AUTHORIZATION',
  LEGAL_INFO: 'LEGAL_INFO',
  LEGAL_REPRESENTATIVE: 'LEGAL_REPRESENTATIVE',
  SUBMISSION: 'SUBMISSION',
} as const;

export type VerificationStep =
  (typeof VerificationStep)[keyof typeof VerificationStep];

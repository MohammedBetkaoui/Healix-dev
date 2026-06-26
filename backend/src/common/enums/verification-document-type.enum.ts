export const VerificationDocumentType = {
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  CNAS_CASNOS: 'CNAS_CASNOS',
  COMMERCIAL_REGISTER: 'COMMERCIAL_REGISTER',
  COMPANY_STATUTES: 'COMPANY_STATUTES',
  HEALTH_AUTHORIZATION: 'HEALTH_AUTHORIZATION',
  LEGAL_REPRESENTATIVE_ID: 'LEGAL_REPRESENTATIVE_ID',
  MEDICAL_DIRECTOR_DOCUMENT: 'MEDICAL_DIRECTOR_DOCUMENT',
  NIF_DOCUMENT: 'NIF_DOCUMENT',
  NIS_DOCUMENT: 'NIS_DOCUMENT',
  REPRESENTATIVE_NOMINATION: 'REPRESENTATIVE_NOMINATION',
} as const;

export type VerificationDocumentType =
  (typeof VerificationDocumentType)[keyof typeof VerificationDocumentType];

export const requiredEstablishmentDocumentTypes = [
  VerificationDocumentType.COMMERCIAL_REGISTER,
  VerificationDocumentType.NIF_DOCUMENT,
  VerificationDocumentType.HEALTH_AUTHORIZATION,
  VerificationDocumentType.LEGAL_REPRESENTATIVE_ID,
  VerificationDocumentType.ADDRESS_PROOF,
] as const;

export const VerificationDocumentType = {
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  CABINET_ADDRESS_PROOF: 'CABINET_ADDRESS_PROOF',
  CABINET_OPENING_AUTHORIZATION: 'CABINET_OPENING_AUTHORIZATION',
  CABINET_OWNERSHIP_OR_RENTAL: 'CABINET_OWNERSHIP_OR_RENTAL',
  CASNOS_CERTIFICATE: 'CASNOS_CERTIFICATE',
  CNAS_CASNOS: 'CNAS_CASNOS',
  COMMERCIAL_REGISTER: 'COMMERCIAL_REGISTER',
  COMPANY_STATUTES: 'COMPANY_STATUTES',
  GOOD_STANDING_CERTIFICATE: 'GOOD_STANDING_CERTIFICATE',
  HEALTH_AUTHORIZATION: 'HEALTH_AUTHORIZATION',
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  LEGAL_REPRESENTATIVE_ID: 'LEGAL_REPRESENTATIVE_ID',
  MEDICAL_DEGREE: 'MEDICAL_DEGREE',
  MEDICAL_DIRECTOR_DOCUMENT: 'MEDICAL_DIRECTOR_DOCUMENT',
  NIF_DOCUMENT: 'NIF_DOCUMENT',
  NIS_DOCUMENT: 'NIS_DOCUMENT',
  ORDRE_REGISTRATION: 'ORDRE_REGISTRATION',
  PRACTICE_AUTHORIZATION: 'PRACTICE_AUTHORIZATION',
  PROFESSIONAL_PHOTO: 'PROFESSIONAL_PHOTO',
  REPRESENTATIVE_NOMINATION: 'REPRESENTATIVE_NOMINATION',
  SPECIALITY_DEGREE: 'SPECIALITY_DEGREE',
  STAMP_SIGNATURE: 'STAMP_SIGNATURE',
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

export const establishmentVerificationDocumentTypes = [
  ...requiredEstablishmentDocumentTypes,
  VerificationDocumentType.NIS_DOCUMENT,
  VerificationDocumentType.COMPANY_STATUTES,
  VerificationDocumentType.CNAS_CASNOS,
  VerificationDocumentType.MEDICAL_DIRECTOR_DOCUMENT,
  VerificationDocumentType.REPRESENTATIVE_NOMINATION,
] as const;

export const requiredDoctorDocumentTypes = [
  VerificationDocumentType.IDENTITY_DOCUMENT,
  VerificationDocumentType.MEDICAL_DEGREE,
  VerificationDocumentType.ORDRE_REGISTRATION,
  VerificationDocumentType.PRACTICE_AUTHORIZATION,
  VerificationDocumentType.CABINET_ADDRESS_PROOF,
  VerificationDocumentType.NIF_DOCUMENT,
] as const;

export const doctorVerificationDocumentTypes = [
  ...requiredDoctorDocumentTypes,
  VerificationDocumentType.SPECIALITY_DEGREE,
  VerificationDocumentType.CASNOS_CERTIFICATE,
  VerificationDocumentType.CABINET_OPENING_AUTHORIZATION,
  VerificationDocumentType.PROFESSIONAL_PHOTO,
  VerificationDocumentType.STAMP_SIGNATURE,
  VerificationDocumentType.CABINET_OWNERSHIP_OR_RENTAL,
  VerificationDocumentType.GOOD_STANDING_CERTIFICATE,
] as const;

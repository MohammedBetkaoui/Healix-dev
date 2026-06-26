export type DoctorVerificationStepId =
  | "IDENTITY"
  | "QUALIFICATION"
  | "PROFESSIONAL_REGISTRATION"
  | "PRACTICE_LOCATION"
  | "FISCAL_SOCIAL"
  | "DOCUMENTS_SUBMISSION";

export type VerificationStatus =
  | "NOT_STARTED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED";

export type DoctorDocumentType =
  | "IDENTITY_DOCUMENT"
  | "MEDICAL_DEGREE"
  | "SPECIALITY_DEGREE"
  | "ORDRE_REGISTRATION"
  | "PRACTICE_AUTHORIZATION"
  | "CABINET_ADDRESS_PROOF"
  | "NIF_DOCUMENT"
  | "CASNOS_CERTIFICATE"
  | "CABINET_OPENING_AUTHORIZATION"
  | "PROFESSIONAL_PHOTO"
  | "STAMP_SIGNATURE"
  | "CABINET_OWNERSHIP_OR_RENTAL"
  | "GOOD_STANDING_CERTIFICATE";

export type DoctorDocumentStatus =
  | "MISSING"
  | "READY"
  | "UPLOADED"
  | "REJECTED";

export type DoctorDocumentRequirement = {
  descriptionKey: string;
  required: boolean;
  titleKey: string;
  type: DoctorDocumentType;
};

export type DoctorDocumentUploadState = {
  fileName?: string;
  fileSize?: number;
  status: DoctorDocumentStatus;
  type: DoctorDocumentType;
};

export type DoctorVerificationFormInput = {
  fullName: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  identityNumber: string;
  identityDocumentType: string;
  phone: string;
  professionalEmail: string;
  wilaya: string;
  commune: string;
  personalOrProfessionalAddress: string;
  doctorType: string;
  speciality: string;
  primaryDegree: string;
  university: string;
  graduationYear: string;
  specialityDegree: string;
  specialityGraduationYear: string;
  ordreRegistrationNumber: string;
  regionalCouncil: string;
  registrationWilaya: string;
  registrationDate: string;
  professionalStatus: string;
  practiceAuthorizationNumber: string;
  issuingAuthority: string;
  cabinetName: string;
  cabinetType: string;
  cabinetAddress: string;
  cabinetWilaya: string;
  cabinetCommune: string;
  cabinetPhone: string;
  cabinetEmail: string;
  healthDirectorate: string;
  cabinetOpeningAuthorizationNumber: string;
  nif: string;
  taxCenter: string;
  casnosNumber: string;
  fiscalActivityType: string;
  professionalRib: string;
  identityDocument: File | null;
  medicalDegreeDocument: File | null;
  specialityDegreeDocument: File | null;
  ordreRegistrationDocument: File | null;
  practiceAuthorizationDocument: File | null;
  cabinetAddressProofDocument: File | null;
  nifDocument: File | null;
  casnosCertificateDocument: File | null;
  cabinetOpeningAuthorizationDocument: File | null;
  professionalPhotoDocument: File | null;
  stampSignatureDocument: File | null;
  cabinetOwnershipOrRentalDocument: File | null;
  goodStandingCertificateDocument: File | null;
  confirmAuthenticity: boolean;
};

export type DoctorVerificationValidationMessages = {
  emailInvalid: string;
  fileTooLarge: string;
  formatNotAccepted: string;
  required: string;
  confirmAuthenticity: string;
};

export type DoctorDocumentFieldName =
  | "identityDocument"
  | "medicalDegreeDocument"
  | "specialityDegreeDocument"
  | "ordreRegistrationDocument"
  | "practiceAuthorizationDocument"
  | "cabinetAddressProofDocument"
  | "nifDocument"
  | "casnosCertificateDocument"
  | "cabinetOpeningAuthorizationDocument"
  | "professionalPhotoDocument"
  | "stampSignatureDocument"
  | "cabinetOwnershipOrRentalDocument"
  | "goodStandingCertificateDocument";

export type DoctorDocumentDefinition = DoctorDocumentRequirement & {
  fieldName: DoctorDocumentFieldName;
};

export type DoctorVerificationStep = {
  fields: (keyof DoctorVerificationFormInput)[];
  id: DoctorVerificationStepId;
  labelKey: string;
  shortLabelKey: string;
};

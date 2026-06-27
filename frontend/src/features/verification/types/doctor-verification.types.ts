export type DoctorVerificationStepId =
  | "IDENTITY"
  | "QUALIFICATION"
  | "PROFESSIONAL_REGISTRATION"
  | "PRACTICE_LOCATION"
  | "FISCAL_SOCIAL"
  | "DOCUMENTS_SUBMISSION";

export type VerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

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
  documentId?: string;
  fileName?: string;
  fileSize?: number;
  status: DoctorDocumentStatus;
  type: DoctorDocumentType;
};

export type UploadedDoctorVerificationDocument = {
  documentType: DoctorDocumentType;
  id: string;
  mimeType: string;
  originalName: string;
  size: number;
  status: "UPLOADED" | "REJECTED" | string;
  uploadedAt: string;
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

export type DoctorVerificationPrefillResponse = {
  doctor: {
    id: string;
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    speciality: string;
    wilaya: string;
    professionalAddress: string;
    isIndependent: boolean;
  };
  verification: {
    status: VerificationStatus;
    currentStep: DoctorVerificationStepId;
    canSubmit: boolean;
  };
  documents?: UploadedDoctorVerificationDocument[];
  draftData?: Partial<{
    fullName: string;
    birthDate: string;
    birthPlace: string;
    nationality: string;
    ninOrIdNumber: string;
    identityDocumentType: string;
    phone: string;
    professionalEmail: string;
    wilaya: string;
    commune: string;
    address: string;
    doctorType: string;
    speciality: string;
    mainDegree: string;
    university: string;
    graduationYear: number;
    specialityDegree: string;
    specialityGraduationYear: number;
    orderRegistrationNumber: string;
    regionalCouncil: string;
    registrationWilaya: string;
    registrationDate: string;
    professionalStatus: string;
    practiceAuthorizationNumber: string;
    authorizationAuthority: string;
    cabinetName: string;
    cabinetType: string;
    cabinetAddress: string;
    cabinetWilaya: string;
    cabinetCommune: string;
    cabinetPhone: string;
    cabinetEmail: string;
    healthDirectionWilaya: string;
    cabinetOpeningAuthorization: string;
    nif: string;
    taxCenter: string;
    casnosNumber: string;
    fiscalActivityType: string;
    professionalRib: string;
    confirmationAccuracy: boolean;
  }>;
};

export type DoctorVerificationRequestResponse = {
  currentStep: DoctorVerificationStepId;
  data?: DoctorVerificationPrefillResponse["draftData"] | null;
  documents: UploadedDoctorVerificationDocument[];
  id: string;
  missingDocuments?: DoctorDocumentType[];
  status: VerificationStatus;
};

export type DoctorVerificationDraftPayload = {
  fullName: string;
  birthDate: string;
  birthPlace?: string;
  nationality?: string;
  ninOrIdNumber: string;
  identityDocumentType: string;
  phone: string;
  professionalEmail: string;
  wilaya: string;
  commune: string;
  address?: string;
  doctorType: string;
  speciality: string;
  mainDegree: string;
  university: string;
  graduationYear: number;
  specialityDegree?: string;
  specialityGraduationYear?: number;
  orderRegistrationNumber: string;
  regionalCouncil?: string;
  registrationWilaya: string;
  registrationDate: string;
  professionalStatus: string;
  practiceAuthorizationNumber?: string;
  authorizationAuthority?: string;
  cabinetName?: string;
  cabinetType: string;
  cabinetAddress: string;
  cabinetWilaya: string;
  cabinetCommune: string;
  cabinetPhone?: string;
  cabinetEmail?: string;
  healthDirectionWilaya: string;
  cabinetOpeningAuthorization?: string;
  nif: string;
  taxCenter: string;
  casnosNumber?: string;
  fiscalActivityType: string;
  professionalRib?: string;
  confirmationAccuracy: boolean;
  currentStep?: DoctorVerificationStepId;
};

export type DoctorVerificationSubmitResponse = {
  message: string;
  status: "PENDING_VERIFICATION";
  submittedAt: string;
};

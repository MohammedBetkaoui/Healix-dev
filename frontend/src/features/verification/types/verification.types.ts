export type VerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED";

export type VerificationStep =
  | "ESTABLISHMENT_INFO"
  | "LEGAL_INFO"
  | "HEALTH_AUTHORIZATION"
  | "LEGAL_REPRESENTATIVE"
  | "DOCUMENTS"
  | "SUBMISSION";

export type RequiredDocumentType =
  | "COMMERCIAL_REGISTER"
  | "NIF_DOCUMENT"
  | "HEALTH_AUTHORIZATION"
  | "LEGAL_REPRESENTATIVE_ID"
  | "ADDRESS_PROOF";

export type DocumentUploadStatus = "MISSING" | "READY" | "UPLOADED" | "REJECTED";

export type DocumentUploadState = {
  fileName?: string;
  fileSize?: number;
  status: DocumentUploadStatus;
  type: RequiredDocumentType;
};

export type EstablishmentVerificationFormInput = {
  address: string;
  addressProofDocument: File | null;
  commune: string;
  commercialRegisterDocument: File | null;
  commercialRegisterNumber: string;
  establishmentName: string;
  establishmentType: string;
  healthAuthorizationDocument: File | null;
  healthAuthorizationNumber: string;
  legalForm: string;
  legalRepresentativeNinOrId: string;
  managerFullName: string;
  managerIdDocument: File | null;
  nif: string;
  nifDocument: File | null;
  phone: string;
  professionalEmail: string;
  wilaya: string;
};

export type EstablishmentVerificationPrefillResponse = {
  establishment: {
    id: string;
    name: string;
    type: string;
    wilaya: string;
    address: string;
    professionalEmail: string;
    phone: string;
    managerFullName: string;
  };
  verification: {
    status: VerificationStatus;
    currentStep: VerificationStep;
    canSubmit: boolean;
  };
  draftData?: Partial<{
    name: string;
    type: string;
    wilaya: string;
    address: string;
    professionalEmail: string;
    phone: string;
    legalRepresentativeFullName: string;
    legalForm: string;
    commune: string;
    legalRepresentativeNinOrId: string;
    commercialRegisterNumber: string;
    nif: string;
    healthAuthorizationNumber: string;
  }>;
};

export type EstablishmentVerificationDraftPayload = {
  name: string;
  type: string;
  legalForm: string;
  wilaya: string;
  commune: string;
  address: string;
  phone: string;
  professionalEmail: string;
  commercialRegisterNumber: string;
  nif: string;
  healthAuthorizationNumber: string;
  legalRepresentativeFullName: string;
  legalRepresentativeNinOrId: string;
  legalRepresentativePhone: string;
  legalRepresentativeEmail: string;
  confirmationAccuracy?: boolean;
  currentStep?: VerificationStep;
};

export type EstablishmentVerificationSubmitResponse = {
  message: string;
  status: "PENDING_VERIFICATION";
  submittedAt: string;
};

export type VerificationValidationMessages = {
  emailInvalid: string;
  fileTooLarge: string;
  formatNotAccepted: string;
  required: string;
};

export type RequiredDocumentDefinition = {
  descriptionKey: string;
  fieldName:
    | "commercialRegisterDocument"
    | "nifDocument"
    | "healthAuthorizationDocument"
    | "managerIdDocument"
    | "addressProofDocument";
  titleKey: string;
  type: RequiredDocumentType;
};

export type VerificationStatus =
  | "NOT_STARTED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED";

export type RequiredDocumentType =
  | "COMMERCIAL_REGISTER"
  | "NIF"
  | "HEALTH_AUTHORIZATION"
  | "MANAGER_ID"
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
  commercialRegisterDocument: File | null;
  commercialRegisterNumber: string;
  establishmentName: string;
  establishmentType: string;
  healthAuthorizationDocument: File | null;
  healthAuthorizationNumber: string;
  managerFullName: string;
  managerIdDocument: File | null;
  nif: string;
  nifDocument: File | null;
  phone: string;
  professionalEmail: string;
  wilaya: string;
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

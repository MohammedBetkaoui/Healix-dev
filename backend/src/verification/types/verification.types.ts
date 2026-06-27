import { type EstablishmentType } from '../../common/enums/establishment-type.enum';
import { type VerificationDocumentType } from '../../common/enums/verification-document-type.enum';
import { type VerificationStatus } from '../../common/enums/verification-status.enum';
import { type VerificationStep } from '../../common/enums/verification-step.enum';

export type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type EstablishmentPrefillResponse = {
  establishment: {
    id: string;
    name: string;
    type: EstablishmentType;
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
  documents: UploadedDocumentSummary[];
};

export type UploadedDocumentSummary = {
  id: string;
  documentType: VerificationDocumentType;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  uploadedAt: Date;
};

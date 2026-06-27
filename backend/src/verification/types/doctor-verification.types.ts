import { type DoctorType } from '../../common/enums/doctor-type.enum';
import { type DoctorVerificationStep } from '../../common/enums/doctor-verification-step.enum';
import { type VerificationDocumentType } from '../../common/enums/verification-document-type.enum';
import { type VerificationStatus } from '../../common/enums/verification-status.enum';
import { type RequestContext, type UploadedDocumentSummary } from './verification.types';

export type DoctorPrefillResponse = {
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
    currentStep: DoctorVerificationStep;
    canSubmit: boolean;
  };
};

export type DoctorVerificationStatusResponse = {
  status: VerificationStatus;
  currentStep: DoctorVerificationStep;
  requiredDocuments: VerificationDocumentType[];
  uploadedDocuments: UploadedDocumentSummary[];
  missingDocuments: VerificationDocumentType[];
  canSubmit: boolean;
};

export type DoctorVerificationSubmitCheck = {
  doctorType?: DoctorType | null;
};

export type { RequestContext };

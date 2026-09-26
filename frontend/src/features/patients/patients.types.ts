import {
  type Patient,
  type PatientAdministrativeStatus,
  type PatientAiAnalysisResult,
  type PatientAiAnalysisType,
  type PatientConsentStatus,
  type PatientConsentType,
  type PatientDocumentType,
  type PatientFilterState,
  type PatientGender,
  type PatientInsurance,
  type PatientMedicalSummary,
  type PatientSector,
  type PatientStatus,
} from "@/types/patient";

export type PatientsListParams = Partial<PatientFilterState> & {
  limit?: number;
  page?: number;
  search?: string;
};

export type PatientsListResponse = {
  data: Patient[];
  meta: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
};

// Prisma enum values for blood group (no "+"/"-" allowed in enum names).
// Mirrors backend/src/common/enums/patient-blood-group.enum.ts.
export type PatientBloodGroupCode =
  | "A_POS"
  | "A_NEG"
  | "B_POS"
  | "B_NEG"
  | "AB_POS"
  | "AB_NEG"
  | "O_POS"
  | "O_NEG";

// Wire shape of the medicalSummary JSON column (backend/prisma/schema.prisma#Patient).
// null until a PATCH ever sets it.
export type PatientMedicalSummaryJson = PatientMedicalSummary | null;

// Wire shape returned by GET /patients and GET /patients/:id — identity and
// demographics only. Mirrors backend/src/patients/patients.service.ts#toPatientResponse.
export type PatientRecord = {
  address: string;
  administrativeStatus: PatientAdministrativeStatus;
  birthDate: string;
  bloodGroup: PatientBloodGroupCode | null;
  commune: string;
  createdAt: string;
  doctorProfileId: string | null;
  email: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  establishmentId: string | null;
  firstName: string;
  firstNameAr: string;
  gender: PatientGender;
  hospitalRecordNumber: string | null;
  id: string;
  insurance: PatientInsurance;
  insuredNumber: string | null;
  lastName: string;
  lastNameAr: string;
  medicalSummary: PatientMedicalSummaryJson;
  nationalId: string;
  phone: string;
  sector: PatientSector;
  smsEnabled: boolean;
  status: PatientStatus;
  updatedAt: string;
  wilaya: string;
};

export type PatientRecordsListResponse = {
  data: PatientRecord[];
  meta: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
};

// Mirrors backend/src/patients/dto/create-patient.dto.ts exactly.
export type CreatePatientPayload = {
  address: string;
  birthDate: string;
  bloodGroup?: PatientBloodGroupCode;
  commune: string;
  duplicateOverrideReason?: string;
  email?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  firstNameAr: string;
  gender: PatientGender;
  hospitalRecordNumber?: string;
  insurance: PatientInsurance;
  insuredNumber?: string;
  lastName: string;
  lastNameAr: string;
  nationalId: string;
  phone: string;
  sector: PatientSector;
  smsEnabled?: boolean;
  wilaya: string;
};

// Mirrors backend/src/patients/dto/update-patient.dto.ts exactly.
export type UpdatePatientPayload = Partial<CreatePatientPayload> & {
  administrativeStatus?: PatientAdministrativeStatus;
  medicalSummary?: PatientMedicalSummary;
  status?: PatientStatus;
};

// Mirrors backend PatientMatchReason (backend/src/patients/patient-matching.util.ts).
export type PatientMatchReason = "IDENTITY" | "PHONE" | "NIN";

// Mirrors backend/src/patients/dto/check-patient-duplicate-query.dto.ts.
export type CheckPatientDuplicateParams = {
  birthDate?: string;
  firstName?: string;
  firstNameAr?: string;
  lastName?: string;
  lastNameAr?: string;
  nationalId?: string;
  phone?: string;
};

// Wire shape returned by GET /patients/check-duplicate.
export type CheckPatientDuplicateResponse = {
  matches: Array<{
    patient: PatientRecord;
    reasons: PatientMatchReason[];
  }>;
};

// Wire shape returned by GET /patients/:id/consents and
// PUT /patients/:id/consents/:type. Mirrors
// backend/src/patients/patients.service.ts#toConsentResponse — a consent is
// its own record (type + status + timestamp + who recorded it), never a
// single flag on the patient.
export type PatientConsentRecord = {
  createdAt: string;
  documentName: string | null;
  id: string;
  patientId: string;
  recordedAt: string;
  recordedById: string;
  status: PatientConsentStatus;
  type: PatientConsentType;
  updatedAt: string;
};

// Mirrors backend/src/patients/dto/upsert-patient-consent.dto.ts exactly.
export type UpsertPatientConsentPayload = {
  documentName?: string;
  status: PatientConsentStatus;
};

// Wire shape returned by GET /patients/:id/consultations and
// POST /patients/:id/consultations. Mirrors
// backend/src/patients/patients.service.ts#toConsultationResponse.
export type PatientConsultationRecord = {
  createdAt: string;
  date: string;
  diagnosis: string;
  doctor: string;
  id: string;
  patientId: string;
  reason: string;
  treatment: string;
  updatedAt: string;
};

// Mirrors backend/src/patients/dto/create-patient-consultation.dto.ts exactly.
// No doctorProfileId: the authoring doctor is derived server-side.
export type CreatePatientConsultationPayload = {
  date: string;
  diagnosis: string;
  reason: string;
  treatment: string;
};

// Wire shape returned by GET /patients/:id/documents and
// POST /patients/:id/documents. Mirrors
// backend/src/patients/patients.service.ts#toDocumentResponse — storedName,
// localPath and checksum are internal storage details and are never
// returned to the client.
export type PatientDocumentRecord = {
  createdAt: string;
  documentType: PatientDocumentType;
  id: string;
  mimeType: string;
  originalName: string;
  patientId: string;
  size: number;
  updatedAt: string;
  uploadedById: string;
};

// Wire shape returned by GET /patients/:id/ai-analyses and
// POST /patients/:id/ai-analyses. Mirrors
// backend/src/patients/patients.service.ts#toAiAnalysisResponse. This is a
// manual record of a result — no real inference model is called yet.
export type PatientAiAnalysisRecord = {
  createdAt: string;
  id: string;
  modelName: string;
  modelVersion: string | null;
  patientId: string;
  requestedById: string;
  result: PatientAiAnalysisResult;
  score: number;
  sourceDocumentId: string | null;
  type: PatientAiAnalysisType;
  updatedAt: string;
};

// Mirrors backend/src/patients/dto/create-patient-ai-analysis.dto.ts exactly.
// Creation requires a signed DIAGNOSTIC_AI consent server-side (403 if
// missing) — see PatientsService.createAiAnalysis.
export type CreatePatientAiAnalysisPayload = {
  modelName: string;
  modelVersion?: string;
  result: PatientAiAnalysisResult;
  score: number;
  sourceDocumentId?: string;
  type: PatientAiAnalysisType;
};

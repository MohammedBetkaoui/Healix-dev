import { type LucideIcon } from "lucide-react";

export type PatientAccountType = "DOCTOR" | "ESTABLISHMENT";

export type PatientGender = "MALE" | "FEMALE";

export type PatientStatus = "ACTIVE" | "FOLLOW_UP" | "NEW" | "URGENT";

export type PatientAdministrativeStatus = "ACTIVE" | "INACTIVE" | "DECEASED";

export type PatientInsurance = "CNAS" | "CASNOS" | "UNINSURED" | "PRIVATE";

export type PatientSector = "PRIVATE" | "PUBLIC" | "CONVENTIONED";

export type PatientConsentType = "HEALTH_DATA" | "DIAGNOSTIC_AI" | "RESEARCH";

export type PatientConsentStatus = "SIGNED" | "NOT_GRANTED";

export type PatientBloodGroup =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-";

export type PatientDocumentType =
  | "PRESCRIPTION"
  | "MEDICAL_REPORT"
  | "MEDICAL_IMAGE"
  | "DICOM";

export type PatientAiAnalysisType = "MRI" | "CT_SCAN" | "XRAY" | "ECG";

export type PatientAiAnalysisResult = "NORMAL" | "ANOMALY_DETECTED";

export type PatientMedicalSummary = {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
  history: string[];
  notes: string;
};

export type PatientConsultation = {
  date: string;
  diagnosis: string;
  doctor: string;
  id: string;
  reason: string;
  treatment: string;
};

export type PatientAiAnalysis = {
  date: string;
  id: string;
  result: PatientAiAnalysisResult;
  score: number;
  type: PatientAiAnalysisType;
};

export type PatientDocument = {
  date: string;
  fileName: string;
  id: string;
  size: string;
  type: PatientDocumentType;
};

export type PatientTimelineEvent = {
  date: string;
  description: string;
  doctor?: string;
  id: string;
  icon: LucideIcon;
  title: string;
};

export type PatientConsent = {
  documentName?: string;
  recordedAt: string;
  recordedBy: string;
  status: PatientConsentStatus;
  type: PatientConsentType;
};

export type PatientAuditEntry = {
  action: string;
  actor: string;
  at: string;
  id: string;
  organization: string;
};

export type Patient = {
  administrativeStatus: PatientAdministrativeStatus;
  address: string;
  aiAnalyses: PatientAiAnalysis[];
  assignedDoctor: string;
  birthDate: string;
  bloodGroup: PatientBloodGroup;
  commune: string;
  consents: PatientConsent[];
  audit: PatientAuditEntry[];
  doctorRegistrationNumber: string;
  documents: PatientDocument[];
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  firstNameAr: string;
  gender: PatientGender;
  id: string;
  hospitalRecordNumber: string;
  insurance: PatientInsurance;
  insuredNumber: string;
  internalId: string;
  lastName: string;
  lastNameAr: string;
  lastVisit: string;
  medicalSummary: PatientMedicalSummary;
  nationalId: string;
  nextVisit: string;
  phone: string;
  registeredAt: string;
  sector: PatientSector;
  smsEnabled: boolean;
  status: PatientStatus;
  timeline: PatientTimelineEvent[];
  consultations: PatientConsultation[];
  wilaya: string;
  wilayaCode: string;
};

export type PatientFilterState = {
  administrativeStatus: string;
  ageGroup: string;
  bloodGroup: string;
  gender: string;
  insurance: string;
  lastVisit: string;
  registeredAt: string;
  sector: string;
  status: string;
  wilaya: string;
};

export type PatientFormValues = {
  address: string;
  birthDate: string;
  commune: string;
  doctorRegistrationNumber: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  firstNameAr: string;
  gender: string;
  healthDataConsent: boolean;
  hospitalRecordNumber: string;
  insurance: string;
  insuredNumber: string;
  lastName: string;
  lastNameAr: string;
  nationalId: string;
  phone: string;
  referringDoctor: string;
  sector: string;
  smsEnabled: boolean;
  wilaya: string;
};

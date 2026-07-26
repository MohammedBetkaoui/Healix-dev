import { type LucideIcon } from "lucide-react";

export type PatientAccountType = "DOCTOR" | "ESTABLISHMENT";

export type PatientGender = "MALE" | "FEMALE";

export type PatientStatus = "ACTIVE" | "FOLLOW_UP" | "NEW" | "URGENT";

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

export type Patient = {
  address: string;
  aiAnalyses: PatientAiAnalysis[];
  assignedDoctor: string;
  birthDate: string;
  bloodGroup: PatientBloodGroup;
  documents: PatientDocument[];
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  gender: PatientGender;
  id: string;
  internalId: string;
  lastName: string;
  lastVisit: string;
  medicalSummary: PatientMedicalSummary;
  phone: string;
  registeredAt: string;
  status: PatientStatus;
  timeline: PatientTimelineEvent[];
  consultations: PatientConsultation[];
};

export type PatientFilterState = {
  ageGroup: string;
  bloodGroup: string;
  gender: string;
  lastVisit: string;
  registeredAt: string;
  status: string;
};

export type PatientFormValues = {
  address: string;
  allergies: string;
  birthDate: string;
  bloodGroup: PatientBloodGroup | "";
  chronicDiseases: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  gender: PatientGender | "";
  history: string;
  lastName: string;
  phone: string;
};

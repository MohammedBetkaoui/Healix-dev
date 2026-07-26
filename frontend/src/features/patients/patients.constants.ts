import {
  type PatientAiAnalysisResult,
  type PatientAiAnalysisType,
  type PatientBloodGroup,
  type PatientDocumentType,
  type PatientGender,
  type PatientStatus,
} from "@/types/patient";

export const patientGenderValues: PatientGender[] = ["MALE", "FEMALE"];

export const patientStatusValues: PatientStatus[] = [
  "ACTIVE",
  "FOLLOW_UP",
  "NEW",
  "URGENT",
];

export const patientBloodGroupValues: PatientBloodGroup[] = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

export const patientDocumentTypeValues: PatientDocumentType[] = [
  "PRESCRIPTION",
  "MEDICAL_REPORT",
  "MEDICAL_IMAGE",
  "DICOM",
];

export const patientAiAnalysisTypeValues: PatientAiAnalysisType[] = [
  "MRI",
  "CT_SCAN",
  "XRAY",
  "ECG",
];

export const patientAiAnalysisResultValues: PatientAiAnalysisResult[] = [
  "NORMAL",
  "ANOMALY_DETECTED",
];

export const patientAgeFilterValues = [
  "UNDER_18",
  "18_40",
  "41_60",
  "OVER_60",
] as const;

export const patientLastVisitFilterValues = [
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "LAST_90_DAYS",
] as const;

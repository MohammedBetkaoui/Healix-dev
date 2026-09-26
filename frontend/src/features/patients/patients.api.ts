import { apiClient } from "@/lib/api/http-client";
import {
  type Patient,
  type PatientBloodGroup,
  type PatientConsent,
  type PatientConsentType,
} from "@/types/patient";

import { type PotentialPatientDuplicate } from "./patient-registry";
import { algerianWilayas } from "./patients.constants";
import {
  type CheckPatientDuplicateParams,
  type CheckPatientDuplicateResponse,
  type CreatePatientPayload,
  type PatientBloodGroupCode,
  type PatientConsentRecord,
  type PatientRecord,
  type PatientRecordsListResponse,
  type PatientsListParams,
  type PatientsListResponse,
  type UpdatePatientPayload,
  type UpsertPatientConsentPayload,
} from "./patients.types";

const bloodGroupToDisplay: Record<PatientBloodGroupCode, PatientBloodGroup> = {
  A_POS: "A+",
  A_NEG: "A-",
  B_POS: "B+",
  B_NEG: "B-",
  AB_POS: "AB+",
  AB_NEG: "AB-",
  O_POS: "O+",
  O_NEG: "O-",
};

function findWilayaCode(wilayaName: string): string {
  return algerianWilayas.find(([, name]) => name === wilayaName)?.[0] ?? "";
}

// The backend Patient model only covers identity/demographics (see
// backend/src/patients/patients.service.ts). Clinical sections with no
// backend endpoint yet (consultations, documents, consents, audit, AI
// analyses, timeline, care team) stay empty placeholders here.
function toPatientViewModel(record: PatientRecord): Patient {
  return {
    address: record.address,
    administrativeStatus: record.administrativeStatus,
    aiAnalyses: [],
    assignedDoctor: "",
    audit: [],
    birthDate: record.birthDate,
    bloodGroup: record.bloodGroup ? bloodGroupToDisplay[record.bloodGroup] : "O+",
    commune: record.commune,
    consents: [],
    consultations: [],
    doctorRegistrationNumber: "",
    documents: [],
    email: record.email ?? "",
    emergencyContactName: record.emergencyContactName,
    emergencyContactPhone: record.emergencyContactPhone,
    firstName: record.firstName,
    firstNameAr: record.firstNameAr,
    gender: record.gender,
    hospitalRecordNumber: record.hospitalRecordNumber ?? "",
    id: record.id,
    insurance: record.insurance,
    insuredNumber: record.insuredNumber ?? "",
    internalId: record.id,
    lastName: record.lastName,
    lastNameAr: record.lastNameAr,
    lastVisit: "",
    medicalSummary: {
      allergies: [],
      chronicDiseases: [],
      currentMedications: [],
      history: [],
      notes: "",
    },
    nationalId: record.nationalId,
    nextVisit: "",
    phone: record.phone,
    registeredAt: record.createdAt.slice(0, 10),
    sector: record.sector,
    smsEnabled: record.smsEnabled,
    status: record.status,
    timeline: [],
    wilaya: record.wilaya,
    wilayaCode: findWilayaCode(record.wilaya),
  };
}

export async function getPatients(
  params: PatientsListParams = {},
): Promise<PatientsListResponse> {
  const response = await apiClient.get<PatientRecordsListResponse>("/patients", {
    params,
  });

  return {
    data: response.data.data.map(toPatientViewModel),
    meta: response.data.meta,
  };
}

export async function getPatientById(id: string): Promise<Patient> {
  const response = await apiClient.get<PatientRecord>(`/patients/${id}`);

  return toPatientViewModel(response.data);
}

export async function createPatient(
  payload: CreatePatientPayload,
): Promise<Patient> {
  const response = await apiClient.post<PatientRecord>("/patients", payload);

  return toPatientViewModel(response.data);
}

export async function updatePatient(
  id: string,
  payload: UpdatePatientPayload,
): Promise<Patient> {
  const response = await apiClient.patch<PatientRecord>(
    `/patients/${id}`,
    payload,
  );

  return toPatientViewModel(response.data);
}

function toPatientConsentViewModel(record: PatientConsentRecord): PatientConsent {
  return {
    documentName: record.documentName ?? undefined,
    recordedAt: record.recordedAt,
    recordedBy: record.recordedById,
    status: record.status,
    type: record.type,
  };
}

export async function getPatientConsents(
  patientId: string,
): Promise<PatientConsent[]> {
  const response = await apiClient.get<PatientConsentRecord[]>(
    `/patients/${patientId}/consents`,
  );

  return response.data.map(toPatientConsentViewModel);
}

export async function upsertPatientConsent(
  patientId: string,
  type: PatientConsentType,
  payload: UpsertPatientConsentPayload,
): Promise<PatientConsent> {
  const response = await apiClient.put<PatientConsentRecord>(
    `/patients/${patientId}/consents/${type}`,
    payload,
  );

  return toPatientConsentViewModel(response.data);
}

export async function checkPatientDuplicate(
  params: CheckPatientDuplicateParams,
): Promise<PotentialPatientDuplicate[]> {
  const response = await apiClient.get<CheckPatientDuplicateResponse>(
    "/patients/check-duplicate",
    { params },
  );

  return response.data.matches.map((match) => ({
    patient: toPatientViewModel(match.patient),
    reasons: match.reasons,
  }));
}

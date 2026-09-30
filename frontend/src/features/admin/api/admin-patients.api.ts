import { bloodGroupToDisplay, findWilayaCode } from "@/features/patients/patients.api";
import { type PatientBloodGroupCode } from "@/features/patients/patients.types";
import { apiClient } from "@/lib/api/http-client";
import {
  type AdminPatientDetailResponse,
  type AdminPatientListItem,
  type AdminPatientsQuery,
  type AdminPatientsResponse,
} from "@/types/admin";
import { type Patient } from "@/types/patient";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminPatients(
  query: AdminPatientsQuery,
): Promise<AdminPatientsResponse> {
  const { data } = await apiClient.get<AdminPatientsResponse>(
    "/admin/patients",
    {
      params: cleanAdminQuery(query),
    },
  );

  return data;
}

export async function getAdminPatientDetail(
  id: string,
): Promise<AdminPatientDetailResponse> {
  const { data } = await apiClient.get<AdminPatientDetailResponse>(
    `/admin/patients/${id}`,
  );

  return data;
}

// PatientsFilters emits display values ("A+"), while the backend enum (and
// AdminPatientsQuery) expects codes ("A_POS"): derived from the same table
// as bloodGroupToDisplay rather than duplicated.
export function toPatientBloodGroupCode(
  displayValue: string,
): PatientBloodGroupCode | undefined {
  return (Object.keys(bloodGroupToDisplay) as PatientBloodGroupCode[]).find(
    (code) => bloodGroupToDisplay[code] === displayValue,
  );
}

// Same mapping as toPatientViewModel (features/patients/patients.api.ts),
// except assignedDoctor, which is now the resolved owner name. The admin list
// item carries no emergency contact, insured number, SMS preference or
// medical summary, so those stay empty placeholders like the other sections
// with no data in this view.
export function toAdminPatientViewModel(item: AdminPatientListItem): Patient {
  return {
    address: item.address,
    administrativeStatus: item.administrativeStatus,
    aiAnalyses: [],
    assignedDoctor: item.ownerName,
    audit: [],
    birthDate: item.birthDate,
    bloodGroup: item.bloodGroup ? bloodGroupToDisplay[item.bloodGroup] : "O+",
    commune: item.commune,
    consents: [],
    consultations: [],
    doctorRegistrationNumber: "",
    documents: [],
    email: item.email ?? "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    firstName: item.firstName,
    firstNameAr: item.firstNameAr,
    gender: item.gender,
    hospitalRecordNumber: item.hospitalRecordNumber ?? "",
    id: item.id,
    insurance: item.insurance,
    insuredNumber: "",
    internalId: item.id,
    lastName: item.lastName,
    lastNameAr: item.lastNameAr,
    lastVisit: "",
    medicalSummary: {
      allergies: [],
      chronicDiseases: [],
      currentMedications: [],
      history: [],
      notes: "",
    },
    nationalId: item.nationalId,
    nextVisit: "",
    phone: item.phone,
    registeredAt: item.createdAt.slice(0, 10),
    sector: item.sector,
    smsEnabled: false,
    status: item.status,
    timeline: [],
    wilaya: item.wilaya,
    wilayaCode: findWilayaCode(item.wilaya),
  };
}

import { type Patient, type PatientFilterState } from "@/types/patient";

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

export type CreatePatientPayload = {
  address: string;
  allergies: string[];
  birthDate: string;
  bloodGroup: string;
  chronicDiseases: string[];
  email?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  gender: string;
  history: string[];
  lastName: string;
  phone: string;
};

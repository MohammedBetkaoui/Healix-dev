import {
  type Patient,
  type PatientAdministrativeStatus,
  type PatientFilterState,
  type PatientGender,
  type PatientInsurance,
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
  status?: PatientStatus;
};

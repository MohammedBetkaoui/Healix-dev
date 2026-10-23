// Wire types of backend/src/consultations (controller, DTOs, mapper).
// A consultation is read here, never edited: it is recorded from the patient
// record (POST /patients/:id/consultations).

import { type AppointmentStatus } from "@/features/appointments/appointments.types";
import { type ReportCategory, type ReportSourceType, type ReportStatus } from "@/features/reports/types/report.types";

export type ConsultationPatient = {
  id: string;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  birthDate: string;
  gender: "MALE" | "FEMALE";
  hospitalRecordNumber: string | null;
};

export type ConsultationDoctor = {
  id: string;
  fullName: string;
  speciality: string;
};

/** One row of GET /consultations. */
export type ConsultationListItem = {
  id: string;
  date: string;
  reason: string;
  diagnosis: string;
  appointmentId: string | null;
  patient: ConsultationPatient;
  doctor: ConsultationDoctor | null;
  prescriptionCount: number;
  reportCount: number;
};

export type ConsultationMeta = {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export type ConsultationPage = { data: ConsultationListItem[]; meta: ConsultationMeta };

/** GET /consultations/stats. */
export type ConsultationStats = {
  month: number;
  prescriptionShare: number;
  today: number;
  week: number;
  withPrescription: number;
};

/** GET /consultations/capabilities. */
export type ConsultationCapabilities = { canCreateConsultation: boolean };

export type LinkedAppointment = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  reason: string;
};

export type LinkedPrescription = {
  id: string;
  number: string | null;
  status: "DRAFT" | "PENDING_VALIDATION" | "VALIDATED" | "CANCELED";
  effectiveStatus: "DRAFT" | "PENDING_VALIDATION" | "VALIDATED" | "CANCELED" | "EXPIRED";
  type: "STANDARD" | "REGULATED" | "PSYCHOTROPIC" | "NARCOTIC";
  prescribedAt: string;
  itemCount: number;
};

export type LinkedReport = {
  id: string;
  number: string | null;
  status: ReportStatus;
  category: ReportCategory;
  sourceType: ReportSourceType;
  title: string;
  version: number;
  effectiveDate: string;
  finalizedAt: string | null;
};

/** GET /consultations/:id. */
export type ConsultationDetail = {
  id: string;
  date: string;
  reason: string;
  diagnosis: string;
  treatment: string;
  createdAt: string;
  updatedAt: string;
  appointmentId: string | null;
  patient: ConsultationPatient;
  doctor: ConsultationDoctor | null;
  appointment: LinkedAppointment | null;
  prescriptions: LinkedPrescription[];
  reports: LinkedReport[];
};

export type ConsultationListFilters = {
  from?: string;
  limit?: number;
  mine?: boolean;
  page?: number;
  patientId?: string;
  prescription?: "with" | "without";
  query?: string;
  to?: string;
};

import { type AppointmentStatus } from "@/features/appointments/appointments.types";
import { type ReportCategory, type ReportSourceType, type ReportStatus } from "@/features/reports/types/report.types";

export type ConsultationStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export type ConsultationPatient = {
  id: string;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  birthDate: string;
  gender: "MALE" | "FEMALE";
  bloodGroup: string | null;
  hospitalRecordNumber: string | null;
};

export type ConsultationDoctor = { id: string; fullName: string; speciality: string };

export type ConsultationListItem = {
  id: string;
  status: ConsultationStatus;
  occurredAt: string;
  startedAt: string | null;
  completedAt: string | null;
  chiefComplaint: string | null;
  primaryDiagnosis: string | null;
  appointmentId: string | null;
  patient: ConsultationPatient;
  doctor: ConsultationDoctor;
  prescriptionCount: number;
  reportCount: number;
};

export type ConsultationMeta = { limit: number; page: number; total: number; totalPages: number };
export type ConsultationPage = { data: ConsultationListItem[]; meta: ConsultationMeta };
export type ConsultationStats = { month: number; prescriptionShare: number; today: number; week: number; withPrescription: number };

export type ConsultationCapabilities = {
  canViewConsultations: boolean;
  canCreateConsultation: boolean;
  canEditConsultation: boolean;
  canStartConsultation: boolean;
  canCompleteConsultation: boolean;
  canCancelConsultation: boolean;
  canAddAddendum: boolean;
};

export type ConsultationVitalSigns = {
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  temperature: number | null;
  weightKg: number | null;
  heightCm: number | null;
};

export type ConsultationDiagnosis = {
  id?: string;
  label: string;
  code: string | null;
  codeSystem: string | null;
  isPrimary: boolean;
  note: string | null;
};

export type ConsultationAddendum = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; fullName: string };
};

export type LinkedAppointment = { id: string; scheduledAt: string; durationMinutes: number; status: AppointmentStatus; reason: string };
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

export type ConsultationDetail = {
  id: string;
  workspaceId: string;
  status: ConsultationStatus;
  startedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  chiefComplaint: string | null;
  historyPresentIllness: string | null;
  clinicalExamination: string | null;
  assessment: string | null;
  carePlan: string | null;
  followUpPlan: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  appointmentId: string | null;
  patient: ConsultationPatient;
  doctor: ConsultationDoctor;
  completedBy: { id: string; fullName: string } | null;
  vitalSigns: (ConsultationVitalSigns & { id: string }) | null;
  diagnoses: ConsultationDiagnosis[];
  addenda: ConsultationAddendum[];
  appointment: LinkedAppointment | null;
  prescriptions: LinkedPrescription[];
  reports: LinkedReport[];
};

export type ConsultationClinicalContext = {
  patient: ConsultationPatient & {
    medicalSummary: { allergies: string[]; chronicDiseases: string[]; currentMedications: string[] };
  };
  recentConsultations: Array<{ id: string; status: ConsultationStatus; occurredAt: string; chiefComplaint: string | null; assessment: string | null }>;
  activePrescriptions: Array<{ id: string; number: string | null; status: string; prescribedAt: string; validUntil: string | null }>;
  recentReports: Array<{ id: string; number: string | null; title: string; status: string; effectiveAt: string }>;
  recentAiAnalyses: Array<{ id: string; pipeline: string; status: string; decisionStatus: string | null; createdAt: string }>;
  recentDocuments: Array<{ id: string; documentType: string; originalName: string; createdAt: string }>;
  recentDicomStudies: Array<{ id: string; studyDate: string | null; studyDescription: string | null; modalities: unknown; seriesCount: number; instancesCount: number; createdAt: string }>;
};

export type UpdateConsultationPayload = {
  chiefComplaint?: string | null;
  historyPresentIllness?: string | null;
  clinicalExamination?: string | null;
  assessment?: string | null;
  carePlan?: string | null;
  followUpPlan?: string | null;
  vitalSigns?: ConsultationVitalSigns | null;
  diagnoses?: Omit<ConsultationDiagnosis, "id">[];
};

export type ConsultationListFilters = {
  from?: string;
  limit?: number;
  mine?: boolean;
  page?: number;
  patientId?: string;
  doctorId?: string;
  status?: ConsultationStatus;
  prescription?: "with" | "without";
  query?: string;
  to?: string;
};

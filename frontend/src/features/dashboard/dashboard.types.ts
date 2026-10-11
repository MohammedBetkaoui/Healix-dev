// GET /dashboard/overview (backend/src/dashboard/dashboard-overview.dto.ts).

export type DashboardPatientName = {
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
};

export type DashboardAppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELED"
  | "NO_SHOW";

export type DashboardAttentionKind =
  | "AI_PENDING_OVER_24H"
  | "APPOINTMENTS_UNCONFIRMED_TODAY"
  | "AI_CONSENT_MISSING";

export type DashboardActivityDay = {
  /** Local day (Africa/Algiers), YYYY-MM-DD. */
  date: string;
  consultations: number;
  completedAppointments: number;
  aiAnalyses: number;
};

export type DashboardRecentAnalysis = {
  id: string;
  createdAt: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED_INPUT";
  modelLabel: string | null;
  decision: "VALIDATED" | "CORRECTED" | "REJECTED" | null;
  decisionLabel: string | null;
  patient: DashboardPatientName & { id: string };
};

export type DashboardOverview = {
  generatedAt: string;
  timeZone: string;
  period: { days: number; from: string; to: string };
  patients: { total: number; newInPeriod: number };
  appointmentsToday: {
    total: number;
    byStatus: Record<DashboardAppointmentStatus, number>;
    next: { scheduledAt: string; patient: DashboardPatientName } | null;
  };
  aiAnalyses: {
    total: number;
    pending: { count: number; oldestCreatedAt: string | null; oldestAgeHours: number | null };
    validated: number;
    corrected: number;
    rejected: number;
    uncertain: { count: number; total: number; threshold: number };
    recent: DashboardRecentAnalysis[];
  };
  activity: DashboardActivityDay[];
  attention: { kind: DashboardAttentionKind; count: number }[];
  affiliatedDoctors: { active: number } | null;
};

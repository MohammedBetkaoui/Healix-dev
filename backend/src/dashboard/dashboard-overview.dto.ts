import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DASHBOARD_MAX_DAYS = 90;

export class DashboardOverviewQueryDto {
  // Length of the period, today included.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_MAX_DAYS)
  days: number = 30;
}

type PatientName = {
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
};

export type DashboardAttentionKind =
  // Analyses awaiting a decision for more than 24 hours.
  | 'AI_PENDING_OVER_24H'
  // Today's appointments still SCHEDULED (not confirmed).
  | 'APPOINTMENTS_UNCONFIRMED_TODAY'
  // Active patients with an analysis requested but no signed DIAGNOSTIC_AI
  // consent (revoked or never recorded).
  | 'AI_CONSENT_MISSING'
  // Urgent messages received that ask for an acknowledgement the user has
  // not given yet (messaging).
  | 'URGENT_MESSAGES_UNACKED';

export type DashboardOverview = {
  generatedAt: string;
  timeZone: string;
  period: { days: number; from: string; to: string };
  patients: { total: number; newInPeriod: number };
  appointmentsToday: {
    total: number;
    byStatus: Record<
      'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW',
      number
    >;
    // Next SCHEDULED or CONFIRMED appointment of the rest of the day.
    next: { scheduledAt: string; patient: PatientName } | null;
  };
  aiAnalyses: {
    // Every run of the period, whatever its outcome.
    total: number;
    // SUCCEEDED runs of the period without a decision yet.
    pending: {
      count: number;
      oldestCreatedAt: string | null;
      oldestAgeHours: number | null;
    };
    validated: number;
    corrected: number;
    rejected: number;
    // SUCCEEDED brain runs of the period whose top-class probability is under
    // the threshold, out of the SUCCEEDED brain runs of the period (the
    // pathology chains have no probability).
    uncertain: { count: number; total: number; threshold: number };
    recent: {
      id: string;
      createdAt: string;
      status: string;
      // brain, pathology-breast or pathology-nuclei.
      pipeline: string;
      // The brain top class, the BreakHis result; null for a nuclei map.
      modelLabel: string | null;
      decision: string | null;
      decisionLabel: string | null;
      patient: PatientName & { id: string };
    }[];
  };
  // One entry per local day of the period, oldest first, days without any
  // activity included.
  activity: {
    date: string;
    consultations: number;
    completedAppointments: number;
    aiAnalyses: number;
  }[];
  // Only kinds with something to handle (count > 0).
  attention: { kind: DashboardAttentionKind; count: number }[];
  // Establishment administrators only: affiliated doctors whose account is
  // active (not suspended).
  affiliatedDoctors: { active: number } | null;
};

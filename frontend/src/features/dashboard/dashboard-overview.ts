// Pure helpers of the doctor and establishment dashboards: links of the
// attention list, today's appointments by status, the activity chart's
// single scale and labels, shares.

import { type Locale } from "@/i18n";

import {
  type DashboardActivityDay,
  type DashboardAppointmentStatus,
  type DashboardAttentionKind,
  type DashboardPatientName,
  type DashboardRecentAnalysis,
} from "./dashboard.types";

export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriodDays = (typeof DASHBOARD_PERIODS)[number];
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodDays = 30;

// "/doctor" or "/establishment": affiliated doctors use the doctor pages.
export type RoleBase = "/doctor" | "/establishment";

export type AttentionLink = {
  kind: DashboardAttentionKind;
  count: number;
  href: string;
  // Clinical results waiting for a medical decision come first.
  priority: boolean;
};

const attentionDestinations: Record<DashboardAttentionKind, (roleBase: RoleBase) => string> = {
  // The follow-up page opens on "awaiting a decision" by default.
  AI_PENDING_OVER_24H: (roleBase) => `${roleBase}/ai-analyses/tracking`,
  APPOINTMENTS_UNCONFIRMED_TODAY: (roleBase) => `${roleBase}/appointments`,
  AI_CONSENT_MISSING: (roleBase) => `${roleBase}/patients`,
  URGENT_MESSAGES_UNACKED: (roleBase) => `${roleBase}/messages`,
};

// An urgent message awaiting its acknowledgement first: someone is waiting
// for the answer.
const attentionOrder: readonly DashboardAttentionKind[] = [
  "URGENT_MESSAGES_UNACKED",
  "AI_PENDING_OVER_24H",
  "APPOINTMENTS_UNCONFIRMED_TODAY",
  "AI_CONSENT_MISSING",
];

// Only what has something to handle, in a fixed order, each with the page
// where it is handled.
export function attentionLinks(
  items: readonly { kind: DashboardAttentionKind; count: number }[],
  roleBase: RoleBase,
): AttentionLink[] {
  return attentionOrder.flatMap((kind) => {
    const count = items.find((item) => item.kind === kind)?.count ?? 0;
    if (count <= 0) return [];
    return [{ count, href: attentionDestinations[kind](roleBase), kind, priority: kind === "AI_PENDING_OVER_24H" || kind === "URGENT_MESSAGES_UNACKED" }];
  });
}

export const APPOINTMENT_FLOW_ORDER: readonly DashboardAppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELED",
];

// Today's appointments by status, with each status' share of the day.
export function appointmentFlow(byStatus: Record<DashboardAppointmentStatus, number>) {
  const total = APPOINTMENT_FLOW_ORDER.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
  return APPOINTMENT_FLOW_ORDER.map((status) => {
    const count = byStatus[status] ?? 0;
    return { count, share: total === 0 ? 0 : count / total, status };
  });
}

export const ACTIVITY_SERIES = ["consultations", "completedAppointments", "aiAnalyses"] as const;
export type ActivitySeriesKey = (typeof ACTIVITY_SERIES)[number];

// Top of the single scale shared by every series: the smallest "round" even
// number (1, 2, 4, 6, 8 or 10 times a power of ten) at or above the largest
// value, 4 at least, so that 0, half and top are whole numbers. (1 × 10^k is
// only ever picked for k ≥ 1, as values of 5 to 9 skip it: it is even.)
export function chartScaleMax(activity: readonly DashboardActivityDay[]): number {
  const largest = Math.max(0, ...activity.flatMap((day) => ACTIVITY_SERIES.map((key) => day[key])));
  if (largest <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(largest));
  for (const mantissa of [1, 2, 4, 6, 8, 10]) {
    if (mantissa * power >= largest) return mantissa * power;
  }
  return 10 * power;
}

export function chartTicks(max: number): number[] {
  return [0, max / 2, max];
}

// Every n-th day gets a label on the axis (the table lists them all).
export function labelStep(days: number): number {
  if (days <= 10) return 1;
  if (days <= 31) return 5;
  return 15;
}

// "11 oct." from "2026-10-11", read as a calendar date (no time zone shift).
export function shortDayLabel(date: string, locale: Locale): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

// count / total, or null when there is nothing to divide by.
export function shareOf(count: number, total: number): number | null {
  return total > 0 ? count / total : null;
}

export function patientName(patient: DashboardPatientName, locale: Locale): string {
  const latin = `${patient.firstName} ${patient.lastName}`.trim();
  const arabic = `${patient.firstNameAr} ${patient.lastNameAr}`.trim();
  return locale === "ar" ? arabic || latin : latin || arabic;
}

export type DecisionBadge = {
  // Translation key of the label, and its tone (always shown with the text).
  key: string;
  pending: boolean;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

const decisionTones = { CORRECTED: "warning", REJECTED: "danger", VALIDATED: "success" } as const;

// As in the follow-up work queue: the decision of a SUCCEEDED run ("awaiting
// a decision" until then), the run state otherwise.
export function decisionBadge(run: Pick<DashboardRecentAnalysis, "decision" | "status">): DecisionBadge {
  if (run.status !== "SUCCEEDED") {
    return { key: `aiAnalyses.tracking.filters.statuses.${run.status}`, pending: false, tone: "neutral" };
  }
  if (run.decision === null) {
    return { key: "aiAnalyses.tracking.worklist.pending", pending: true, tone: "info" };
  }
  return { key: `aiAnalyses.decision.statuses.${run.decision}`, pending: false, tone: decisionTones[run.decision] };
}

export function analysisHref(roleBase: RoleBase, run: { id: string; patient: { id: string } }): string {
  return `${roleBase}/ai-analyses/runs/${run.id}?patient=${encodeURIComponent(run.patient.id)}`;
}

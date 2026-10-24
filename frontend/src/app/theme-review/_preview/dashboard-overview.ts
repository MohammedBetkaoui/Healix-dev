// Invented GET /dashboard/overview responses for the theme-review page only
// (development builds, see [view]/page.tsx). The dashboards themselves only
// ever show what the backend returns.
import { type DashboardOverview, type DashboardRecentAnalysis } from "@/features/dashboard/dashboard.types";

const TIME_ZONE = "Africa/Algiers";

const recentRows: Array<[string, string, string, string, DashboardRecentAnalysis["pipeline"], DashboardRecentAnalysis["status"], string | null, DashboardRecentAnalysis["decision"], string | null]> = [
  ["Nadia", "Mansouri", "نادية", "منصوري", "brain", "SUCCEEDED", "glioma", null, null],
  ["Karim", "Belkacem", "كريم", "بلقاسم", "pathology-breast", "SUCCEEDED", "malignant", "VALIDATED", "malignant"],
  ["Lina", "Boudiaf", "لينا", "بوضياف", "brain", "SUCCEEDED", "notumor", "CORRECTED", "pituitary"],
  ["Yacine", "Ferhat", "ياسين", "فرحات", "pathology-nuclei", "FAILED", null, null, null],
  ["Sofia", "Haddad", "صوفيا", "حداد", "pathology-breast", "SUCCEEDED", "benign", "REJECTED", null],
];

// Today's date in Algiers, then the previous days by calendar arithmetic.
function periodDays(now: Date, days: number): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE, year: "numeric" }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (days - 1 - index))).toISOString().slice(0, 10),
  );
}

export function previewDashboardOverview(days: number, withDoctors: boolean, now = new Date()): DashboardOverview {
  const activity = periodDays(now, days).map((date, index) => {
    // Fridays stay empty, as a quiet day would.
    const friday = new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
    return {
      aiAnalyses: friday ? 0 : (index * 2) % 3,
      completedAppointments: friday ? 0 : 1 + ((index * 5) % 4),
      consultations: friday ? 0 : 2 + ((index * 3) % 5),
      date,
    };
  });
  const total = activity.reduce((sum, day) => sum + day.aiAnalyses, 0);
  const failed = total > 3 ? 1 : 0;
  const validated = Math.round(total * 0.5);
  const corrected = Math.round(total * 0.15);
  const rejected = Math.round(total * 0.1);
  const pending = Math.max(0, total - failed - validated - corrected - rejected);
  const hour = 3_600_000;

  return {
    activity,
    affiliatedDoctors: withDoctors ? { active: 6 } : null,
    aiAnalyses: {
      corrected,
      pending: {
        count: pending,
        oldestAgeHours: pending > 0 ? 30 : null,
        oldestCreatedAt: pending > 0 ? new Date(now.getTime() - 30 * hour).toISOString() : null,
      },
      recent: recentRows.map(([firstName, lastName, firstNameAr, lastNameAr, pipeline, status, modelLabel, decision, decisionLabel], index) => ({
        createdAt: new Date(now.getTime() - (index * 5 + 1) * hour).toISOString(),
        decision,
        decisionLabel,
        id: `preview-run-${index}`,
        modelLabel,
        patient: { firstName, firstNameAr, id: `preview-patient-${index}`, lastName, lastNameAr },
        pipeline,
        status,
      })),
      rejected,
      total,
      uncertain: { count: Math.round((total - failed) * 0.2), threshold: 0.9, total: total - failed },
      urgentPending: 0,
      validated,
    },
    appointmentsToday: {
      byStatus: { CANCELED: 1, COMPLETED: 2, CONFIRMED: 2, NO_SHOW: 1, SCHEDULED: 2 },
      next: {
        patient: { firstName: "Mohamed", firstNameAr: "محمد", lastName: "Ben Ali", lastNameAr: "بن علي" },
        scheduledAt: new Date(Math.ceil((now.getTime() + hour) / (15 * 60_000)) * 15 * 60_000).toISOString(),
      },
      total: 8,
    },
    attention: [
      { count: 2, kind: "AI_PENDING_OVER_24H" },
      { count: 2, kind: "APPOINTMENTS_UNCONFIRMED_TODAY" },
      { count: 1, kind: "AI_CONSENT_MISSING" },
    ],
    generatedAt: now.toISOString(),
    patients: { newInPeriod: Math.ceil(days / 6), total: 20 },
    period: {
      days,
      from: new Date(`${activity[0].date}T00:00:00+01:00`).toISOString(),
      to: now.toISOString(),
    },
    timeZone: TIME_ZONE,
  };
}

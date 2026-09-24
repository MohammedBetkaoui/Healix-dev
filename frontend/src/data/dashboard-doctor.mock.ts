import type { DashboardStatusTone } from "@/types/dashboard";

/** Local presentation data only. Real identity/account status is fetched separately.
 * Keep all demo volumes here, never combine them with patient API responses. */
export const doctorDemo = {
  source: "demo",
  metrics: { patients: 36, analyses: 89, reports: 24 },
  activity: [
    { day: -29, primary: 8, secondary: 12 },
    { day: -23, primary: 14, secondary: 16 },
    { day: -17, primary: 11, secondary: 18 },
    { day: -11, primary: 18, secondary: 21 },
    { day: -5, primary: 15, secondary: 19 },
    { day: 0, primary: 19, secondary: 23 },
  ],
  ai: {
    // Specialty buckets, not document types or workflow states.
    specialties: [
      { key: "brain", count: 26 },
      { key: "cardiology", count: 19 },
      { key: "other", count: 44 },
    ],
    pending: 9,
  },
  recent: [
    { key: "analysis", patientKey: "patient1", dateKey: "today", status: "completed", tone: "success" },
    { key: "report", patientKey: "patient2", dateKey: "yesterday", status: "generated", tone: "info" },
    { key: "consultation", patientKey: "patient3", dateKey: "june12", status: "created", tone: "neutral" },
  ] satisfies { key: string; patientKey: string; dateKey: string; status: string; tone: DashboardStatusTone }[],
} as const;

import type { DashboardStatusTone } from "@/types/dashboard";

/** Presentation-only fixtures. Never merge these with API responses or interpret
 * them as patient alerts. The dashboard labels this entire activity area as demo.
 * Account identity and verification are supplied independently by existing hooks. */
export const establishmentDemo = {
  source: "demo",
  metrics: { planned: 24, arrived: 18, upcoming: 6, waiting: 7, waitingMinutes: 14, doctorsActive: 11, doctorsTotal: 14, results: 8, priorityResults: 2 },
  attention: [
    { key: "biology", count: 3, href: "#lab", priority: true },
    { key: "affiliations", count: 2, href: "#doctors", priority: false },
    { key: "appointments", count: 4, href: "#appointments", priority: false },
    { key: "records", count: 1, href: "/establishment/patients", priority: false },
    { key: "ai", count: 2, href: "#analyses", priority: false },
  ],
  flow: [
    { key: "planned", count: 24 }, { key: "arrived", count: 18 },
    { key: "waiting", count: 7 }, { key: "consulting", count: 5 }, { key: "completed", count: 6 },
  ],
  // Sample daily volumes at these day offsets, not aggregate or live totals.
  activity: [
    { day: -29, consultations: 16, records: 11, exams: 6 },
    { day: -24, consultations: 22, records: 14, exams: 9 },
    { day: -19, consultations: 19, records: 12, exams: 8 },
    { day: -14, consultations: 28, records: 18, exams: 13 },
    { day: -9, consultations: 24, records: 16, exams: 10 },
    { day: -4, consultations: 32, records: 21, exams: 14 },
    { day: 0, consultations: 26, records: 18, exams: 12 },
  ],
  recent: [
    { key: "consultation", patient: "01", time: "10:42", status: "completed", tone: "success" },
    { key: "record", patient: "02", time: "10:35", status: "updated", tone: "neutral" },
    { key: "exam", patient: "03", time: "10:18", status: "review", tone: "warning" },
    { key: "appointment", patient: "04", time: "09:56", status: "confirmed", tone: "info" },
  ] satisfies { key: string; patient: string; time: string; status: string; tone: DashboardStatusTone }[],
  ai: {
    specialties: [{ key: "brain", count: 4 }, { key: "cardiology", count: 3 }, { key: "pathology", count: 3 }, { key: "radiology", count: 2 }],
    // Mutually exclusive states; specialty distribution is deliberately separate.
    completed: 8, pending: 2, review: 2,
  },
} as const;

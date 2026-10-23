import { type ReportListFilters } from "./types/report.types";

export const reportKeys = {
  all: ["reports"] as const,
  lists: ["reports", "list"] as const,
  list: (filters: ReportListFilters) => ["reports", "list", filters] as const,
  stats: ["reports", "stats"] as const,
  capabilities: ["reports", "capabilities"] as const,
  patient: (patientId: string) => ["reports", "patient", patientId] as const,
  patients: ["reports", "patient"] as const,
  detail: (id: string) => ["reports", "detail", id] as const,
  history: (id: string) => ["reports", "history", id] as const,
  // Outside ["reports", "detail", id] on purpose: invalidating the detail
  // after an action must not download (and audit) the PDF again.
  pdf: (id: string) => ["reports", "pdf", id] as const,
};

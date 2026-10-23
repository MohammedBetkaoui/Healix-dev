import { type PrescriptionListFilters } from "./types/prescription.types";

export const prescriptionKeys = {
  all: ["prescriptions"] as const,
  lists: ["prescriptions", "list"] as const,
  list: (filters: PrescriptionListFilters) => ["prescriptions", "list", filters] as const,
  stats: ["prescriptions", "stats"] as const,
  capabilities: ["prescriptions", "capabilities"] as const,
  prescriberContext: ["prescriptions", "prescriber-context"] as const,
  medications: (q: string) => ["prescriptions", "medications", q] as const,
  medicationOptions: ["prescriptions", "medications", "options"] as const,
  patientSearch: (search: string) => ["prescriptions", "patient-search", search] as const,
  patientContext: (patientId: string) => ["prescriptions", "patient-context", patientId] as const,
  detail: (id: string) => ["prescriptions", "detail", id] as const,
  history: (id: string) => ["prescriptions", "history", id] as const,
  // Outside ["prescriptions", "detail", id] on purpose: invalidating the
  // detail after an action must not download (and audit) the PDF again.
  pdf: (id: string) => ["prescriptions", "pdf", id] as const,
};

import { type ConsultationListFilters } from "./types/consultation.types";

export const consultationKeys = {
  all: ["consultations"] as const,
  lists: ["consultations", "list"] as const,
  list: (filters: ConsultationListFilters) => ["consultations", "list", filters] as const,
  stats: ["consultations", "stats"] as const,
  capabilities: ["consultations", "capabilities"] as const,
  detail: (id: string) => ["consultations", "detail", id] as const,
};

import { isAxiosError } from "axios";

import { type ConsultationListFilters, type ConsultationStatus } from "../types/consultation.types";

export type ConsultationFilterValue = {
  doctor: string;
  from: string;
  mine: boolean;
  patient: string;
  prescription: "" | "with" | "without";
  query: string;
  status: "" | ConsultationStatus;
  to: string;
};

export const initialConsultationFilters: ConsultationFilterValue = { doctor: "", from: "", mine: false, patient: "", prescription: "", query: "", status: "", to: "" };

/** The filters of the form as the query of GET /consultations (a day is the whole day, UTC). */
export function toConsultationListFilters(filters: ConsultationFilterValue, query: string, page: number, limit: number): ConsultationListFilters {
  return {
    doctorId: filters.doctor || undefined,
    from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
    limit,
    mine: filters.mine || undefined,
    page,
    patientId: filters.patient || undefined,
    prescription: filters.prescription || undefined,
    query: query || undefined,
    status: filters.status || undefined,
    to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
  };
}

/** Text cut at `max` characters, on a word when it can, with an ellipsis. */
export function truncateText(value: string, max = 90) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Key under consultations.errors for a failed call. */
export function getConsultationErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const status = error.response?.status;
  if (status === undefined) return "network";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 400) return "invalid";
  return "unknown";
}

/** Label of the consultation for the places that need to name it (`encounter` of a prescription or a report). */
export function consultationLabel(date: string, reason: string | null, locale: "fr" | "ar") {
  const formatted = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
  return `${formatted} — ${reason ? truncateText(reason, 60) : ""}`;
}

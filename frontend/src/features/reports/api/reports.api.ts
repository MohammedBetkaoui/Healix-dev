import { apiClient } from "@/lib/api/http-client";

import {
  type ClinicalReport,
  type CreateReportInput,
  type ImportReportInput,
  type ReportCapabilities,
  type ReportHistoryEntry,
  type ReportListFilters,
  type ReportListItem,
  type ReportPage,
  type ReportStats,
  type UpdateReportInput,
} from "../types/report.types";

// Finalizing renders the PDF (Chromium) before answering: well above the 10 s
// default timeout of apiClient. An import uploads a file.
export const FINALIZE_TIMEOUT_MS = 60_000;
export const IMPORT_TIMEOUT_MS = 60_000;

const path = (id: string, suffix = "") => `/reports/${encodeURIComponent(id)}${suffix}`;

export async function listReports(filters: ReportListFilters = {}) {
  const { data } = await apiClient.get<ReportPage>("/reports", { params: filters });
  return data;
}

export async function getReportStats() {
  const { data } = await apiClient.get<ReportStats>("/reports/stats");
  return data;
}

export async function getReportCapabilities() {
  const { data } = await apiClient.get<ReportCapabilities>("/reports/capabilities");
  return data;
}

export async function listPatientReports(patientId: string) {
  const { data } = await apiClient.get<ReportListItem[]>(`/reports/patients/${encodeURIComponent(patientId)}`);
  return data;
}

export async function getReport(id: string) {
  const { data } = await apiClient.get<ClinicalReport>(path(id));
  return data;
}

export async function createReport(input: CreateReportInput) {
  const { data } = await apiClient.post<ClinicalReport>("/reports", input);
  return data;
}

export async function updateReport(id: string, input: UpdateReportInput) {
  const { data } = await apiClient.patch<ClinicalReport>(path(id), input);
  return data;
}

export async function deleteReportDraft(id: string) {
  const { data } = await apiClient.delete<{ deleted: true }>(path(id));
  return data;
}

export async function finalizeReport(id: string) {
  const { data } = await apiClient.post<ClinicalReport>(path(id, "/finalize"), undefined, { timeout: FINALIZE_TIMEOUT_MS });
  return data;
}

export async function amendReport(id: string) {
  const { data } = await apiClient.post<ClinicalReport>(path(id, "/amend"));
  return data;
}

export async function cancelReport(id: string, reason: string) {
  const { data } = await apiClient.post<ClinicalReport>(path(id, "/cancel"), { reason });
  return data;
}

/** POST /reports/import: multipart, the file next to the fields of ImportReportDto. */
export async function importReport({ file, ...fields }: ImportReportInput) {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") form.append(key, value);
  }
  const { data } = await apiClient.post<ClinicalReport>("/reports/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: IMPORT_TIMEOUT_MS,
  });
  return data;
}

export async function getReportHistory(id: string) {
  const { data } = await apiClient.get<ReportHistoryEntry[]>(path(id, "/history"));
  return data;
}

// GET /reports/:id/pdf: the PDF of the report, of its AI analysis, or the
// imported file. Each call is audited server-side (REPORT_DOCUMENT_VIEWED).
export async function getReportPdf(id: string) {
  const { data } = await apiClient.get<Blob>(path(id, "/pdf"), { responseType: "blob" });
  return data;
}

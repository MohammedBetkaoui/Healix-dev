import { apiClient } from "@/lib/api/http-client";

import {
  type CreatePrescriptionInput,
  type Medication,
  type PatientContext,
  type PrescriberIdentity,
  type Prescription,
  type PrescriptionCapabilities,
  type PrescriptionHistoryEntry,
  type PrescriptionListFilters,
  type PrescriptionPage,
  type PrescriptionStats,
  type UpdatePrescriptionInput,
} from "../types/prescription.types";

// Validation renders the PDF (Chromium) before answering: well above the
// 10 s default timeout of apiClient.
export const VALIDATE_TIMEOUT_MS = 60_000;

const path = (id: string, suffix = "") =>
  `/prescriptions/${encodeURIComponent(id)}${suffix}`;

export async function listPrescriptions(filters: PrescriptionListFilters = {}) {
  const { data } = await apiClient.get<PrescriptionPage>("/prescriptions", {
    params: filters,
  });
  return data;
}

export async function getPrescriptionStats() {
  const { data } = await apiClient.get<PrescriptionStats>("/prescriptions/stats");
  return data;
}

export async function getPrescriptionCapabilities() {
  const { data } = await apiClient.get<PrescriptionCapabilities>(
    "/prescriptions/capabilities",
  );
  return data;
}

export async function searchMedications(q: string, limit = 20) {
  const { data } = await apiClient.get<Medication[]>(
    "/prescriptions/medications",
    { params: { q: q || undefined, limit } },
  );
  return data;
}

export async function getPrescriberContext() {
  const { data } = await apiClient.get<PrescriberIdentity>(
    "/prescriptions/prescriber-context",
  );
  return data;
}

export async function getPatientContext(patientId: string) {
  const { data } = await apiClient.get<PatientContext>(
    `/prescriptions/patients/${encodeURIComponent(patientId)}/context`,
  );
  return data;
}

export async function createPrescription(input: CreatePrescriptionInput) {
  const { data } = await apiClient.post<Prescription>("/prescriptions", input);
  return data;
}

export async function getPrescription(id: string) {
  const { data } = await apiClient.get<Prescription>(path(id));
  return data;
}

export async function updatePrescription(
  id: string,
  input: UpdatePrescriptionInput,
) {
  const { data } = await apiClient.patch<Prescription>(path(id), input);
  return data;
}

export async function deletePrescriptionDraft(id: string) {
  const { data } = await apiClient.delete<{ deleted: true }>(path(id));
  return data;
}

export async function submitPrescription(id: string) {
  const { data } = await apiClient.post<Prescription>(path(id, "/submit"));
  return data;
}

export async function validatePrescription(id: string) {
  const { data } = await apiClient.post<Prescription>(
    path(id, "/validate"),
    undefined,
    { timeout: VALIDATE_TIMEOUT_MS },
  );
  return data;
}

export async function cancelPrescription(id: string, reason: string) {
  const { data } = await apiClient.post<Prescription>(path(id, "/cancel"), {
    reason,
  });
  return data;
}

export async function renewPrescription(id: string) {
  const { data } = await apiClient.post<Prescription>(path(id, "/renew"));
  return data;
}

export async function getPrescriptionHistory(id: string) {
  const { data } = await apiClient.get<PrescriptionHistoryEntry[]>(
    path(id, "/history"),
  );
  return data;
}

// GET /prescriptions/:id/pdf: the archived document, only for a validated or
// canceled prescription. Each call is audited server-side (DOCUMENT_VIEWED).
export async function getPrescriptionPdf(id: string) {
  const { data } = await apiClient.get<Blob>(path(id, "/pdf"), {
    responseType: "blob",
  });
  return data;
}

export async function markPrescriptionPrinted(id: string) {
  const { data } = await apiClient.post<Prescription>(path(id, "/printed"));
  return data;
}

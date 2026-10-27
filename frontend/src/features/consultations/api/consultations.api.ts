import { apiClient } from "@/lib/api/http-client";

import {
  type ConsultationCapabilities,
  type ConsultationClinicalContext,
  type ConsultationDetail,
  type ConsultationListFilters,
  type ConsultationPage,
  type ConsultationStats,
  type UpdateConsultationPayload,
} from "../types/consultation.types";

export async function listConsultations(filters: ConsultationListFilters = {}) {
  const { data } = await apiClient.get<ConsultationPage>("/consultations", { params: filters });
  return data;
}

export async function getConsultationStats() {
  const { data } = await apiClient.get<ConsultationStats>("/consultations/stats");
  return data;
}

export async function getConsultationCapabilities() {
  const { data } = await apiClient.get<ConsultationCapabilities>("/consultations/capabilities");
  return data;
}

export async function getConsultation(id: string) {
  const { data } = await apiClient.get<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}`);
  return data;
}

export async function getConsultationClinicalContext(id: string) {
  const { data } = await apiClient.get<ConsultationClinicalContext>(`/consultations/${encodeURIComponent(id)}/clinical-context`);
  return data;
}

export async function createConsultation(payload: { patientId: string; appointmentId?: string }) {
  const { data } = await apiClient.post<ConsultationDetail>("/consultations", payload);
  return data;
}

export async function updateConsultation(id: string, payload: UpdateConsultationPayload) {
  const { data } = await apiClient.patch<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function startConsultation(id: string) {
  const { data } = await apiClient.post<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}/start`);
  return data;
}

export async function completeConsultation(id: string) {
  const { data } = await apiClient.post<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}/complete`);
  return data;
}

export async function cancelConsultation(id: string, reason: string) {
  const { data } = await apiClient.post<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}/cancel`, { reason });
  return data;
}

export async function addConsultationAddendum(id: string, content: string) {
  const { data } = await apiClient.post<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}/addenda`, { content });
  return data;
}

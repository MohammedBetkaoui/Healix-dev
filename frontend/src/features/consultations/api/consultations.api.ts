import { apiClient } from "@/lib/api/http-client";

import {
  type ConsultationCapabilities,
  type ConsultationDetail,
  type ConsultationListFilters,
  type ConsultationPage,
  type ConsultationStats,
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

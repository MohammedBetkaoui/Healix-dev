"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getConsultationCapabilities, getConsultationStats, listConsultations } from "../api/consultations.api";
import { consultationKeys } from "../consultation-query-keys";
import { type ConsultationListFilters } from "../types/consultation.types";

export function useConsultations(filters: ConsultationListFilters) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listConsultations(filters),
    queryKey: consultationKeys.list(filters),
    retry: false,
    staleTime: 15_000,
  });
}

export function useConsultationStats() {
  return useQuery({ queryFn: getConsultationStats, queryKey: consultationKeys.stats, retry: false, staleTime: 15_000 });
}

// Creating a consultation is for a physician; the administration reads.
export function useConsultationCapabilities() {
  const query = useQuery({
    queryFn: getConsultationCapabilities,
    queryKey: consultationKeys.capabilities,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return {
    ...query,
    capabilities: query.data ?? {
      canViewConsultations: false,
      canCreateConsultation: false,
      canEditConsultation: false,
      canStartConsultation: false,
      canCompleteConsultation: false,
      canCancelConsultation: false,
      canAddAddendum: false,
    },
  };
}

// Patients of the latest consultations, for the patient filter (the API has no
// endpoint listing them).
export function useConsultationFilterOptions() {
  return useQuery({
    queryFn: () => listConsultations({ limit: 50 }),
    queryKey: consultationKeys.list({ limit: 50 }),
    retry: false,
    select: (page) => ({
      patients: [...new Map(page.data.map((row) => [row.patient.id, row.patient])).values()],
      doctors: [...new Map(page.data.map((row) => [row.doctor.id, row.doctor])).values()],
    }),
    staleTime: 60_000,
  });
}

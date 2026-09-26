"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientAiAnalyses } from "../patients.api";

export function usePatientAiAnalyses(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientAiAnalyses(patientId),
    queryKey: ["patients", "ai-analyses", patientId],
    retry: false,
    staleTime: 15_000,
  });
}

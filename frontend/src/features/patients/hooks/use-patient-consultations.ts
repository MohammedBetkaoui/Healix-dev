"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientConsultations } from "../patients.api";

export function usePatientConsultations(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientConsultations(patientId),
    queryKey: ["patients", "consultations", patientId],
    retry: false,
    staleTime: 15_000,
  });
}

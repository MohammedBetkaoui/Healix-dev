"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientConsents } from "../patients.api";

export function usePatientConsents(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientConsents(patientId),
    queryKey: ["patients", "consents", patientId],
    retry: false,
    staleTime: 15_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientDocuments } from "../patients.api";

export function usePatientDocuments(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientDocuments(patientId),
    queryKey: ["patients", "documents", patientId],
    retry: false,
    staleTime: 15_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { getPatients } from "@/features/patients/patients.api";

import { getPatientContext } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";

export function usePatientContext(patientId: string | null) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientContext(patientId as string),
    queryKey: prescriptionKeys.patientContext(patientId ?? ""),
    retry: false,
    staleTime: 30_000,
  });
}

// Patients of the workspace matching what the prescriber types.
export function usePatientSearch(search: string) {
  const term = useDebouncedValue(search.trim(), 300);
  return useQuery({
    queryFn: () => getPatients({ limit: 10, search: term || undefined }),
    queryKey: prescriptionKeys.patientSearch(term),
    retry: false,
    staleTime: 30_000,
  });
}

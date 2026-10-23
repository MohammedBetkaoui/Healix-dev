"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";

import { searchMedications } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";

/** Pause after the last keystroke before the reference is queried. */
export const MEDICATION_SEARCH_DEBOUNCE_MS = 300;

export function useMedicationSearch(query: string, enabled = true) {
  const q = useDebouncedValue(query.trim(), MEDICATION_SEARCH_DEBOUNCE_MS);
  return useQuery({
    enabled,
    queryFn: () => searchMedications(q),
    queryKey: prescriptionKeys.medications(q),
    retry: false,
    staleTime: 60_000,
  });
}

// First entries of the reference, for the medication filter of the list.
export function useMedicationOptions() {
  return useQuery({
    queryFn: () => searchMedications("", 50),
    queryKey: prescriptionKeys.medicationOptions,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

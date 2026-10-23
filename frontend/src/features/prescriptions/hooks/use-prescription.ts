"use client";

import { useQuery } from "@tanstack/react-query";

import { getPrescription, getPrescriptionHistory } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";

export function usePrescription(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getPrescription(id as string),
    queryKey: prescriptionKeys.detail(id ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

export function usePrescriptionHistory(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getPrescriptionHistory(id as string),
    queryKey: prescriptionKeys.history(id ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

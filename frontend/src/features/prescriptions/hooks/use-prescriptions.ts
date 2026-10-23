"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getPrescriptionStats, listPrescriptions } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";
import { type PrescriptionListFilters } from "../types/prescription.types";

export function usePrescriptions(filters: PrescriptionListFilters) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listPrescriptions(filters),
    queryKey: prescriptionKeys.list(filters),
    retry: false,
    staleTime: 15_000,
  });
}

// People and prescribers of the latest prescriptions, for the filter lists
// (the API has no endpoint listing the prescribers of a workspace).
export function usePrescriptionFilterOptions() {
  return useQuery({
    queryFn: () => listPrescriptions({ limit: 50 }),
    queryKey: prescriptionKeys.list({ limit: 50 }),
    retry: false,
    select: (page) => {
      const patients = new Map(page.data.map((row) => [row.patient.id, row.patient]));
      const prescribers = new Map(page.data.map((row) => [row.prescriber.id, row.prescriber]));
      return { patients: [...patients.values()], prescribers: [...prescribers.values()] };
    },
    staleTime: 60_000,
  });
}

export function usePrescriptionStats() {
  return useQuery({
    queryFn: getPrescriptionStats,
    queryKey: prescriptionKeys.stats,
    retry: false,
    staleTime: 15_000,
  });
}

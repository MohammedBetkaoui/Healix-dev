"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientClinicalNotes } from "../patients.api";

export const clinicalNotesKey = (patientId: string) => ["patients", "clinical-notes", patientId] as const;

// The opinions filed from the case discussions ("Notes" tab of the record).
export function usePatientClinicalNotes(patientId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(patientId),
    queryFn: () => getPatientClinicalNotes(patientId),
    queryKey: clinicalNotesKey(patientId),
    retry: false,
    staleTime: 15_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientAuditLog } from "../patients.api";

export function usePatientAuditLog(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getPatientAuditLog(patientId),
    queryKey: ["patients", "audit-log", patientId],
    retry: false,
    staleTime: 15_000,
  });
}

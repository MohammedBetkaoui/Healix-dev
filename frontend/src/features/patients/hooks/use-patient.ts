"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientById } from "../patients.api";

export function usePatient(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getPatientById(id),
    queryKey: ["patients", "detail", id],
    retry: false,
    staleTime: 15_000,
  });
}

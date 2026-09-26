"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatients } from "../patients.api";
import { type PatientsListParams } from "../patients.types";

export function usePatients(params: PatientsListParams = {}) {
  return useQuery({
    queryFn: () => getPatients(params),
    queryKey: ["patients", "list", params],
    retry: false,
    staleTime: 15_000,
  });
}

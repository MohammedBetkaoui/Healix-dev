"use client";

import { useQuery } from "@tanstack/react-query";

import { type AdminPatientsQuery } from "@/types/admin";

import { listAdminPatients } from "../api/admin-patients.api";

export function useAdminPatients(query: AdminPatientsQuery) {
  return useQuery({
    queryFn: () => listAdminPatients(query),
    queryKey: ["admin", "patients", query],
    retry: false,
    staleTime: 15_000,
  });
}

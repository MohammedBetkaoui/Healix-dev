"use client";

import { useQuery } from "@tanstack/react-query";

import { getAdminPatientDetail } from "../api/admin-patients.api";

// Each fetch writes an ADMIN_VIEWED_PATIENT audit entry server-side, so no
// retry (same as the other admin hooks); window-focus refetch is already
// disabled globally in app/providers.tsx.
export function useAdminPatientDetail(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryFn: () => getAdminPatientDetail(id as string),
    queryKey: ["admin", "patients", "detail", id],
    retry: false,
  });
}

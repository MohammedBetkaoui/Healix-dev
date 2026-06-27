"use client";

import { useQuery } from "@tanstack/react-query";

import { type AdminVerificationsQuery } from "@/types/admin";

import { listAdminVerifications } from "../api/admin-verifications.api";

export function useAdminVerifications(query: AdminVerificationsQuery) {
  return useQuery({
    queryFn: () => listAdminVerifications(query),
    queryKey: ["admin", "verifications", query],
    retry: false,
    staleTime: 15_000,
  });
}

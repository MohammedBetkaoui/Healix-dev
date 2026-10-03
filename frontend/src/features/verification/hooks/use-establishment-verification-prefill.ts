"use client";

import { useQuery } from "@tanstack/react-query";

import { getEstablishmentVerificationPrefill } from "../api/establishment-verification.api";

// `enabled` lets pages shared with doctor accounts skip this
// ESTABLISHMENT_ADMIN-only request (the backend would answer 403). Only set
// when given, so the QueryClient default still applies otherwise.
export function useEstablishmentVerificationPrefill(options?: { enabled?: boolean }) {
  return useQuery({
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
    queryKey: ["verification", "establishment", "prefill"],
    queryFn: getEstablishmentVerificationPrefill,
    refetchOnMount: "always",
    retry: false,
    staleTime: 0,
  });
}

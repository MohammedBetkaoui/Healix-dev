"use client";

import { useQuery } from "@tanstack/react-query";

import { getEstablishmentVerificationPrefill } from "../api/establishment-verification.api";

export function useEstablishmentVerificationPrefill() {
  return useQuery({
    queryKey: ["verification", "establishment", "prefill"],
    queryFn: getEstablishmentVerificationPrefill,
    retry: false,
    staleTime: 30_000,
  });
}

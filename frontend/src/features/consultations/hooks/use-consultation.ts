"use client";

import { useQuery } from "@tanstack/react-query";

import { getConsultation } from "../api/consultations.api";
import { consultationKeys } from "../consultation-query-keys";

export function useConsultation(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getConsultation(id as string),
    queryKey: consultationKeys.detail(id ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

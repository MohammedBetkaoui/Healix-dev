"use client";

import { useQuery } from "@tanstack/react-query";

import { getPrescriberContext } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";

export function usePrescriberContext(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: getPrescriberContext,
    queryKey: prescriptionKeys.prescriberContext,
    retry: false,
    staleTime: 60_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getPrescriptionPdf } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";

// The archived PDF, as a Blob. Every fetch writes a DOCUMENT_VIEWED audit
// entry, so it is fetched once while shown (staleTime Infinity) and dropped
// as soon as nothing shows it (gcTime 0).
export function usePrescriptionPdf(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    gcTime: 0,
    queryFn: () => getPrescriptionPdf(id as string),
    queryKey: prescriptionKeys.pdf(id ?? ""),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

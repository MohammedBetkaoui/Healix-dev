"use client";

import { useQuery } from "@tanstack/react-query";

import { getReportPdf } from "../api/reports.api";
import { reportKeys } from "../report-query-keys";

// The PDF, as a Blob. Every fetch writes a REPORT_DOCUMENT_VIEWED audit entry,
// so it is fetched once while shown (staleTime Infinity) and dropped as soon
// as nothing shows it (gcTime 0).
export function useReportPdf(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    gcTime: 0,
    queryFn: () => getReportPdf(id as string),
    queryKey: reportKeys.pdf(id ?? ""),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

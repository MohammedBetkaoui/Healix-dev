"use client";

import { useQuery } from "@tanstack/react-query";

import { getReport, getReportHistory } from "../api/reports.api";
import { reportKeys } from "../report-query-keys";

export function useReport(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getReport(id as string),
    queryKey: reportKeys.detail(id ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

export function useReportHistory(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getReportHistory(id as string),
    queryKey: reportKeys.history(id ?? ""),
    retry: false,
    staleTime: 15_000,
  });
}

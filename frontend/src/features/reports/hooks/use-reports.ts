"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getReportStats, listPatientReports, listReports } from "../api/reports.api";
import { reportKeys } from "../report-query-keys";
import { type ReportListFilters } from "../types/report.types";

export function useReports(filters: ReportListFilters) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listReports(filters),
    queryKey: reportKeys.list(filters),
    retry: false,
    staleTime: 15_000,
  });
}

export function useReportStats() {
  return useQuery({ queryFn: getReportStats, queryKey: reportKeys.stats, retry: false, staleTime: 15_000 });
}

// Patients and authors of the latest reports, for the filter lists (the API
// has no endpoint listing them).
export function useReportFilterOptions() {
  return useQuery({
    queryFn: () => listReports({ includeSuperseded: true, limit: 100 }),
    queryKey: reportKeys.list({ includeSuperseded: true, limit: 100 }),
    retry: false,
    select: (page) => ({
      authors: [...new Map(page.data.map((row) => [row.author.id, row.author])).values()],
      patients: [...new Map(page.data.map((row) => [row.patient.id, row.patient])).values()],
    }),
    staleTime: 60_000,
  });
}

export function usePatientReports(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => listPatientReports(patientId),
    queryKey: reportKeys.patient(patientId),
    retry: false,
    staleTime: 15_000,
  });
}

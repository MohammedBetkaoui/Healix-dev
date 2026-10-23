"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  amendReport,
  cancelReport,
  createReport,
  deleteReportDraft,
  finalizeReport,
  importReport,
  updateReport,
} from "../api/reports.api";
import { consultationKeys } from "@/features/consultations/consultation-query-keys";

import { reportKeys } from "../report-query-keys";
import { type ClinicalReport, type CreateReportInput, type ImportReportInput, type UpdateReportInput } from "../types/report.types";

// A mutation refreshes the lists (center and patient records), the counters
// and the report it touched. The PDF key is never invalidated (see
// report-query-keys): the PDF of a version does not change once it exists.
function useRefreshReports() {
  const queryClient = useQueryClient();
  return (report?: Pick<ClinicalReport, "id" | "replaces">) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reportKeys.lists }),
      queryClient.invalidateQueries({ queryKey: reportKeys.patients }),
      queryClient.invalidateQueries({ queryKey: reportKeys.stats }),
      // A report written from a consultation shows in its detail.
      queryClient.invalidateQueries({ queryKey: consultationKeys.all }),
      ...(report
        ? [
            queryClient.invalidateQueries({ queryKey: reportKeys.detail(report.id) }),
            queryClient.invalidateQueries({ queryKey: reportKeys.history(report.id) }),
            // Finalizing an amendment makes the version it replaces a past one.
            ...(report.replaces ? [queryClient.invalidateQueries({ queryKey: reportKeys.detail(report.replaces.id) })] : []),
          ]
        : []),
    ]);
}

export function useCreateReport() {
  const refresh = useRefreshReports();
  return useMutation({ mutationFn: (input: CreateReportInput) => createReport(input), onSuccess: (report) => refresh(report) });
}

export function useUpdateReport() {
  const refresh = useRefreshReports();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReportInput }) => updateReport(id, input),
    onSuccess: (report) => refresh(report),
  });
}

export function useDeleteReportDraft() {
  const queryClient = useQueryClient();
  const refresh = useRefreshReports();
  return useMutation({
    mutationFn: (id: string) => deleteReportDraft(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: reportKeys.detail(id) });
      queryClient.removeQueries({ queryKey: reportKeys.history(id) });
      return refresh();
    },
  });
}

export function useFinalizeReport() {
  const refresh = useRefreshReports();
  return useMutation({ mutationFn: (id: string) => finalizeReport(id), onSuccess: (report) => refresh(report) });
}

export function useAmendReport() {
  const refresh = useRefreshReports();
  return useMutation({
    mutationFn: (id: string) => amendReport(id),
    onSuccess: async (report) => {
      await refresh(report);
    },
  });
}

export function useCancelReport() {
  const refresh = useRefreshReports();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelReport(id, reason),
    onSuccess: (report) => refresh(report),
  });
}

export function useImportReport() {
  const refresh = useRefreshReports();
  return useMutation({ mutationFn: (input: ImportReportInput) => importReport(input), onSuccess: (report) => refresh(report) });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getAiAnalysisRun, getAiAnalysisRunMask } from "../ai-analysis-runs.api";

const RUNNING_POLL_MS = 3_000;

// One run; polled while the backend still reports it RUNNING.
export function useAiAnalysisRun(patientId: string, runId: string) {
  return useQuery({
    enabled: Boolean(patientId) && Boolean(runId),
    queryFn: () => getAiAnalysisRun(patientId, runId),
    queryKey: ["patients", "ai-analysis-runs", patientId, runId],
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? RUNNING_POLL_MS : false),
    retry: false,
  });
}

// The segmentation mask (PNG). Fetched once, dropped when nothing shows it.
export function useAiAnalysisRunMask(patientId: string, runId: string, options: { enabled: boolean }) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 0,
    queryFn: () => getAiAnalysisRunMask(patientId, runId),
    queryKey: ["patients", "ai-analysis-run-mask", patientId, runId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

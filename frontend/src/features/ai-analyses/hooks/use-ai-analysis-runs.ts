"use client";

import { useQuery } from "@tanstack/react-query";

import { getAiAnalysisRuns } from "../ai-analysis-runs.api";

// The patient's runs, most recent first. Same key prefix as one run
// (["patients", "ai-analysis-runs", patientId, runId]): invalidating the list
// refreshes the runs too.
export function useAiAnalysisRuns(patientId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: (options.enabled ?? true) && Boolean(patientId),
    queryFn: () => getAiAnalysisRuns(patientId),
    queryKey: ["patients", "ai-analysis-runs", patientId],
    retry: false,
  });
}

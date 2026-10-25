"use client";

import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { correctAiAnalysisVolumetry } from "../ai-analysis-runs.api";
import { type CorrectVolumetryPayload } from "../volumetry";

// The physician's changes to the measures of a cine, before the decision. The answer is the run with
// its measures calculated again: it replaces the cached one. On a 409 (decided, or corrected elsewhere
// meanwhile) the run is read again to show what is in force.
export function useCorrectVolumetry(patientId: string, runId: string) {
  const queryClient = useQueryClient();
  const runKey = ["patients", "ai-analysis-runs", patientId, runId];

  return useMutation({
    mutationFn: (payload: CorrectVolumetryPayload) => correctAiAnalysisVolumetry(patientId, runId, payload),
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        void queryClient.invalidateQueries({ exact: true, queryKey: runKey });
      }
    },
    onSuccess: (run) => {
      queryClient.setQueryData(runKey, run);
      // The follow-up reads the measures in force (priority, worklist).
      void queryClient.invalidateQueries({ queryKey: ["ai-analysis-runs"] });
    },
  });
}

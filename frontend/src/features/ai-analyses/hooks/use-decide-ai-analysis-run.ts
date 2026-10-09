"use client";

import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { decideAiAnalysisRun, type DecideAiAnalysisRunPayload } from "../ai-analysis-runs.api";

// The physician's final decision. The answer is the decided run: it replaces
// the cached one, and the patient's list is refreshed. On a 409 (decided
// elsewhere meanwhile), the run is read again to show that decision.
export function useDecideAiAnalysisRun(patientId: string, runId: string) {
  const queryClient = useQueryClient();
  const runKey = ["patients", "ai-analysis-runs", patientId, runId];

  return useMutation({
    mutationFn: (payload: DecideAiAnalysisRunPayload) => decideAiAnalysisRun(patientId, runId, payload),
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        void queryClient.invalidateQueries({ exact: true, queryKey: runKey });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ exact: true, queryKey: ["patients", "ai-analysis-runs", patientId] });
    },
    onSuccess: (run) => {
      queryClient.setQueryData(runKey, run);
    },
  });
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAiAnalysisRun, type CreateAiAnalysisRunPayload } from "../ai-analysis-runs.api";

// Starts an analysis; the request lasts as long as the inference (≤ 60 s).
// A failed run is still recorded server-side, so the list is refreshed on
// error as well.
export function useCreateAiAnalysisRun(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAiAnalysisRunPayload) => createAiAnalysisRun(patientId, payload),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients", "ai-analysis-runs", patientId] });
    },
  });
}

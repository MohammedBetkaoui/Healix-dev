"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createPatientAiAnalysis } from "../patients.api";
import { type CreatePatientAiAnalysisPayload } from "../patients.types";

type CreatePatientAiAnalysisVariables = {
  patientId: string;
  payload: CreatePatientAiAnalysisPayload;
};

export function useCreatePatientAiAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, payload }: CreatePatientAiAnalysisVariables) =>
      createPatientAiAnalysis(patientId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["patients", "ai-analyses", variables.patientId],
      });
    },
  });
}

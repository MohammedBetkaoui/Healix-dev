"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createPatientConsultation } from "../patients.api";
import { type CreatePatientConsultationPayload } from "../patients.types";

type CreatePatientConsultationVariables = {
  patientId: string;
  payload: CreatePatientConsultationPayload;
};

export function useCreatePatientConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, payload }: CreatePatientConsultationVariables) =>
      createPatientConsultation(patientId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["patients", "consultations", variables.patientId],
      });
    },
  });
}

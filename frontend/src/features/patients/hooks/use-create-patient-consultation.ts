"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { consultationKeys } from "@/features/consultations/consultation-query-keys";

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
      // The consultations page lists the same consultations.
      void queryClient.invalidateQueries({ queryKey: consultationKeys.all });
    },
  });
}

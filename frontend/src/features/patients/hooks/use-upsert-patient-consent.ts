"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type PatientConsentType } from "@/types/patient";

import { upsertPatientConsent } from "../patients.api";
import { type UpsertPatientConsentPayload } from "../patients.types";

type UpsertPatientConsentVariables = {
  patientId: string;
  payload: UpsertPatientConsentPayload;
  type: PatientConsentType;
};

export function useUpsertPatientConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, type, payload }: UpsertPatientConsentVariables) =>
      upsertPatientConsent(patientId, type, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["patients", "consents", variables.patientId],
      });
    },
  });
}

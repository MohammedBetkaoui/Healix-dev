"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updatePatient } from "../patients.api";
import { type UpdatePatientPayload } from "../patients.types";

type UpdatePatientVariables = {
  id: string;
  payload: UpdatePatientPayload;
};

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdatePatientVariables) =>
      updatePatient(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["patients", "list"] });
      void queryClient.invalidateQueries({
        queryKey: ["patients", "detail", variables.id],
      });
    },
  });
}

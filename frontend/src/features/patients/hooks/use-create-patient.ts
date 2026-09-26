"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createPatient } from "../patients.api";
import { type CreatePatientPayload } from "../patients.types";

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePatientPayload) => createPatient(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients", "list"] });
    },
  });
}

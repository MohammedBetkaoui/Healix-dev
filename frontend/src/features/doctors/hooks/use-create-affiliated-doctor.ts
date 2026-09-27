"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAffiliatedDoctor } from "../doctors.api";
import { type CreateAffiliatedDoctorPayload } from "../doctors.types";

export function useCreateAffiliatedDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAffiliatedDoctorPayload) =>
      createAffiliatedDoctor(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["doctors", "affiliated", "list"],
      });
    },
  });
}

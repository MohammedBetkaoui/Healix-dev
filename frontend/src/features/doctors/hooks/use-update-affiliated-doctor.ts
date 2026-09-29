"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateAffiliatedDoctor } from "../doctors.api";
import { type UpdateAffiliatedDoctorPayload } from "../doctors.types";

type UpdateAffiliatedDoctorVariables = {
  id: string;
  payload: UpdateAffiliatedDoctorPayload;
};

export function useUpdateAffiliatedDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateAffiliatedDoctorVariables) =>
      updateAffiliatedDoctor(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["doctors", "affiliated", "list"],
      });
    },
  });
}

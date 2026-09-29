"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { reactivateAffiliatedDoctor } from "../doctors.api";

export function useReactivateAffiliatedDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (doctorProfileId: string) =>
      reactivateAffiliatedDoctor(doctorProfileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["doctors", "affiliated", "list"],
      });
    },
  });
}

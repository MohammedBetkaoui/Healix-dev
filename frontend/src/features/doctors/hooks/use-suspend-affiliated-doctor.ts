"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { suspendAffiliatedDoctor } from "../doctors.api";

export function useSuspendAffiliatedDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (doctorProfileId: string) =>
      suspendAffiliatedDoctor(doctorProfileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["doctors", "affiliated", "list"],
      });
    },
  });
}

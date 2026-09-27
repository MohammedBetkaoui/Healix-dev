"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createAppointment } from "../appointments.api";
import { type CreateAppointmentPayload } from "../appointments.types";

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      createAppointment(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments", "list"] });
    },
  });
}

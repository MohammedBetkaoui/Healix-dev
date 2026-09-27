"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateAppointment } from "../appointments.api";
import { type UpdateAppointmentPayload } from "../appointments.types";

type UpdateAppointmentVariables = {
  id: string;
  payload: UpdateAppointmentPayload;
};

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateAppointmentVariables) =>
      updateAppointment(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments", "list"] });
      void queryClient.invalidateQueries({
        queryKey: ["appointments", "detail", variables.id],
      });
    },
  });
}

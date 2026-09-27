"use client";

import { useQuery } from "@tanstack/react-query";

import { getAppointmentById } from "../appointments.api";

export function useAppointment(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getAppointmentById(id),
    queryKey: ["appointments", "detail", id],
    retry: false,
    staleTime: 15_000,
  });
}

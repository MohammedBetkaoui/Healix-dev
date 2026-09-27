"use client";

import { useQuery } from "@tanstack/react-query";

import { getAppointments } from "../appointments.api";
import { type AppointmentsListParams } from "../appointments.types";

export function useAppointments(params: AppointmentsListParams) {
  return useQuery({
    queryFn: () => getAppointments(params),
    queryKey: ["appointments", "list", params],
    retry: false,
    staleTime: 15_000,
  });
}

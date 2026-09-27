"use client";

import { useQuery } from "@tanstack/react-query";

import { getAppointmentDoctors } from "../appointments.api";

export function useAppointmentDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: getAppointmentDoctors,
    queryKey: ["appointments", "doctors"],
    retry: false,
    staleTime: 60_000,
  });
}

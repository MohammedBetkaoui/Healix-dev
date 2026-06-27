"use client";

import { useQuery } from "@tanstack/react-query";

import { getDoctorVerificationPrefill } from "../api/doctor-verification.api";

export function useDoctorVerificationPrefill() {
  return useQuery({
    queryKey: ["verification", "doctor", "prefill"],
    queryFn: getDoctorVerificationPrefill,
    refetchOnMount: "always",
    retry: false,
    staleTime: 0,
  });
}

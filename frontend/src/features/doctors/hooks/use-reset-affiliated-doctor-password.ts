"use client";

import { useMutation } from "@tanstack/react-query";

import { resetAffiliatedDoctorPassword } from "../doctors.api";

// No invalidateQueries: a password reset does not change the doctors list.
export function useResetAffiliatedDoctorPassword() {
  return useMutation({
    mutationFn: (doctorProfileId: string) =>
      resetAffiliatedDoctorPassword(doctorProfileId),
  });
}

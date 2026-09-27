"use client";

import { useQuery } from "@tanstack/react-query";

import { getAffiliatedDoctors } from "../doctors.api";

export function useAffiliatedDoctors() {
  return useQuery({
    queryFn: getAffiliatedDoctors,
    queryKey: ["doctors", "affiliated", "list"],
    retry: false,
    staleTime: 15_000,
  });
}

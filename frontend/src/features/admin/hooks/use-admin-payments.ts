"use client";

import { useQuery } from "@tanstack/react-query";

import { type AdminPaymentsQuery } from "@/types/admin";

import { listAdminPayments } from "../api/admin-payments.api";

export function useAdminPayments(query: AdminPaymentsQuery) {
  return useQuery({
    queryFn: () => listAdminPayments(query),
    queryKey: ["admin", "payments", query],
    retry: false,
    staleTime: 15_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getAdminPaymentDetail } from "../api/admin-payments.api";

// Each fetch writes an ADMIN_VIEWED_PAYMENT audit entry server-side, so no
// retry (same as the other admin hooks); window-focus refetch is already
// disabled globally in app/providers.tsx.
export function useAdminPaymentDetail(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryFn: () => getAdminPaymentDetail(id as string),
    queryKey: ["admin", "payments", "detail", id],
    retry: false,
  });
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { getPaymentStatus } from "../api/payments.api";

// GET /payments/:id is a plain owner-scoped read (no audit entry), so polling
// it has no side effect.
export function usePaymentStatus(paymentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => getPaymentStatus(paymentId),
    queryKey: ["payments", "status", paymentId],
    // Only an admin review can move the payment on by itself. CREATED and
    // WAITING_PAYMENT wait for the user; the other statuses are final.
    refetchInterval: (current) =>
      current.state.data?.status === "WAITING_ADMIN_REVIEW" ? 15_000 : false,
  });
  const status = query.data?.status;

  // Once paid, the subscription (plan) and the current user (account status)
  // change server-side. Both queries have no staleTime, so plain invalidation
  // would only re-mark them stale: "all" also refetches them while their pages
  // are unmounted, so the subscription page and the dashboard are current on
  // the way back. status stays PAID afterwards, so this runs once.
  useEffect(() => {
    if (status !== "PAID") {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["subscription", "me"], refetchType: "all" });
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });
  }, [queryClient, status]);

  return {
    data: query.data ?? null,
    error: query.error ? normalizeApiError(query.error).message : null,
    isLoading: query.isLoading,
  };
}

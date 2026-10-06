"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  activateAdminCashPayment,
  approveAdminPayment,
  rejectAdminPayment,
} from "../api/admin-payments.api";

// 409: the payment is no longer WAITING_ADMIN_REVIEW (e.g. another admin
// already reviewed it).
export function isPaymentReviewConflict(error: unknown) {
  return isAxiosError(error) && error.response?.status === 409;
}

export function useReviewAdminPayment(id: string) {
  const queryClient = useQueryClient();

  // ["admin", "payments"] is a prefix of both the list and the detail key
  // (["admin", "payments", "detail", id]); approving or activating also
  // changes the user's account status and the dashboard counters.
  const invalidatePayment = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "payments"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    ]);
  };

  // On a conflict the cached status is stale too: refresh the same queries
  // so the detail shows what the other review did.
  const invalidateOnConflict = (error: unknown) => {
    if (isPaymentReviewConflict(error)) {
      void invalidatePayment();
    }
  };

  const approve = useMutation({
    mutationFn: (adminNote?: string) => approveAdminPayment(id, adminNote),
    onError: invalidateOnConflict,
    onSuccess: invalidatePayment,
  });

  const activateCash = useMutation({
    mutationFn: (adminNote?: string) => activateAdminCashPayment(id, adminNote),
    onError: invalidateOnConflict,
    onSuccess: invalidatePayment,
  });

  const reject = useMutation({
    mutationFn: (payload: { adminNote?: string; reason: string }) =>
      rejectAdminPayment(id, payload.reason, payload.adminNote),
    onError: invalidateOnConflict,
    onSuccess: invalidatePayment,
  });

  return {
    activateCash,
    approve,
    isPending: approve.isPending || activateCash.isPending || reject.isPending,
    reject,
  };
}

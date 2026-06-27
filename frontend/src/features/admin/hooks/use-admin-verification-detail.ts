"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveAdminVerification,
  getAdminVerificationDetail,
  rejectAdminVerification,
} from "../api/admin-verifications.api";

export function useAdminVerificationDetail(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getAdminVerificationDetail(id),
    queryKey: ["admin", "verifications", id],
    retry: false,
    staleTime: 15_000,
  });
}

export function useAdminVerificationDecision(id: string) {
  const queryClient = useQueryClient();

  const invalidateVerification = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    ]);
  };

  const approve = useMutation({
    mutationFn: (adminNote?: string) => approveAdminVerification(id, adminNote),
    onSuccess: invalidateVerification,
  });

  const reject = useMutation({
    mutationFn: (payload: { adminNote?: string; reason: string }) =>
      rejectAdminVerification(id, payload.reason, payload.adminNote),
    onSuccess: invalidateVerification,
  });

  return {
    approve,
    isPending: approve.isPending || reject.isPending,
    reject,
  };
}

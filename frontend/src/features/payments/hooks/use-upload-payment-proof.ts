"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { uploadPaymentProof } from "../api/payments.api";
import { type PaymentProofType } from "../types/payment.types";

export function useUploadPaymentProof(
  paymentId: string,
  proofType: PaymentProofType,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (isLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await uploadPaymentProof(paymentId, file, proofType);
        // The payment page shares the ["payments", "status", id] cache with the
        // status page: refresh it first so the status page opens on the new
        // status instead of flashing the pre-submit one.
        await queryClient.invalidateQueries({ queryKey: ["payments", "status", paymentId] });
        router.push(`/subscription/payment-status/${paymentId}`);
      } catch (caughtError) {
        setError(normalizeApiError(caughtError).message);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, paymentId, queryClient, proofType, router],
  );

  return {
    error,
    isLoading,
    upload,
  };
}

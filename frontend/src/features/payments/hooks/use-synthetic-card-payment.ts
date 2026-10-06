"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { paySyntheticChargily } from "../api/payments.api";
import { type SyntheticChargilyPayload } from "../types/payment.types";

export function useSyntheticCardPayment(paymentId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submit = useCallback(
    async (payload: SyntheticChargilyPayload) => {
      if (isLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await paySyntheticChargily(paymentId, payload);
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
    [isLoading, paymentId, queryClient, router],
  );

  return {
    error,
    isLoading,
    submit,
  };
}

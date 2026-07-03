"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { paySyntheticChargily } from "../api/payments.api";
import { type SyntheticChargilyPayload } from "../types/payment.types";

export function useSyntheticCardPayment(paymentId: string) {
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
        router.push(`/subscription/payment-status/${paymentId}`);
      } catch (caughtError) {
        setError(normalizeApiError(caughtError).message);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, paymentId, router],
  );

  return {
    error,
    isLoading,
    submit,
  };
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { createPaymentIntent } from "../api/payments.api";
import {
  type CreatePaymentIntentPayload,
  type CreatePaymentIntentResponse,
} from "../types/payment.types";

export function useCreatePaymentIntent() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mutate = useCallback(
    async (
      payload: CreatePaymentIntentPayload,
    ): Promise<CreatePaymentIntentResponse | null> => {
      if (isLoading) {
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await createPaymentIntent(payload);
        router.push(response.redirectTo);
        return response;
      } catch (caughtError) {
        setError(normalizeApiError(caughtError).message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, router],
  );

  return {
    createIntent: mutate,
    error,
    isLoading,
  };
}

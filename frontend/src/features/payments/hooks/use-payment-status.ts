"use client";

import { useEffect, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { getPaymentStatus } from "../api/payments.api";
import { type PaymentSummary } from "../types/payment.types";

export function usePaymentStatus(paymentId: string) {
  const [data, setData] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPayment() {
      setIsLoading(true);
      setError(null);

      try {
        const payment = await getPaymentStatus(paymentId);

        if (mounted) {
          setData(payment);
        }
      } catch (caughtError) {
        if (mounted) {
          setError(normalizeApiError(caughtError).message);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPayment();

    return () => {
      mounted = false;
    };
  }, [paymentId]);

  return {
    data,
    error,
    isLoading,
  };
}

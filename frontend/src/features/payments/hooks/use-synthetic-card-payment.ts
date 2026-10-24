"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useCallback, useState } from "react";

import { normalizeApiError } from "@/lib/api/api-error";

import { paySyntheticChargily } from "../api/payments.api";
import {
  type ActivatedSubscription,
  type SyntheticChargilyPayload,
} from "../types/payment.types";

// Once a payment has changed the subscription (and the account), everything
// that shows it is fetched again, and awaited: the subscription page, the
// entitlements behind the banner and the gauges, the history, the plans and
// the current user. "all" refreshes the queries of pages that are not mounted
// too, so the dashboard the user goes back to is already current.
export async function refreshSubscriptionData(
  queryClient: QueryClient,
  paymentId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["subscription"], refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" }),
    ...(paymentId
      ? [queryClient.invalidateQueries({ queryKey: ["payments", "status", paymentId] })]
      : []),
  ]);
}

export type CardPaymentOutcome =
  | { kind: "declined" }
  | { kind: "error"; message: string }
  | { kind: "paid"; subscription: ActivatedSubscription };

// The card is declined by the demo gateway with 400 PAYMENT_DECLINED: nothing
// was debited and the subscription did not change.
export function isCardDeclined(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    error.response?.status === 400 &&
    (error.response.data as { code?: unknown } | undefined)?.code === "PAYMENT_DECLINED"
  );
}

// Pays, then refreshes what the payment changed before saying so: when this
// resolves "paid", the subscription is active and the data on screen is
// current. The payment is a function argument so that it can be exercised
// without a network.
export async function payByCard(
  paymentId: string,
  payload: SyntheticChargilyPayload,
  queryClient: QueryClient,
  pay: typeof paySyntheticChargily = paySyntheticChargily,
): Promise<CardPaymentOutcome> {
  try {
    const result = await pay(paymentId, payload);
    await refreshSubscriptionData(queryClient, paymentId);
    return { kind: "paid", subscription: result.subscription };
  } catch (caughtError) {
    // The payment is FAILED on the server: refresh it, the page then offers
    // another attempt.
    await queryClient.invalidateQueries({ queryKey: ["payments", "status", paymentId] });

    return isCardDeclined(caughtError)
      ? { kind: "declined" }
      : { kind: "error", message: normalizeApiError(caughtError).message };
  }
}

type CardAttempt = { outcome: CardPaymentOutcome; paymentId: string };

// An outcome belongs to the payment it came from. Another attempt is a new
// payment on the same page (only ?paymentId= changes, the page stays mounted):
// it starts clean, not on the refusal of the previous card.
export function outcomeOfPayment(
  attempt: CardAttempt | null,
  paymentId: string,
): CardPaymentOutcome | null {
  return attempt?.paymentId === paymentId ? attempt.outcome : null;
}

export function useSyntheticCardPayment(paymentId: string) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<CardAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const outcome = outcomeOfPayment(attempt, paymentId);

  const submit = useCallback(
    async (payload: SyntheticChargilyPayload) => {
      if (isLoading) {
        return;
      }

      setIsLoading(true);
      setAttempt(null);

      try {
        setAttempt({
          outcome: await payByCard(paymentId, payload, queryClient),
          paymentId,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, paymentId, queryClient],
  );

  return {
    declined: outcome?.kind === "declined",
    error: outcome?.kind === "error" ? outcome.message : null,
    isLoading,
    paid: outcome?.kind === "paid" ? outcome.subscription : null,
    submit,
  };
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getSubscriptionHistory } from "../subscriptions.api";

export const subscriptionHistoryQueryKey = ["subscription", "history"] as const;

export function useSubscriptionHistory() {
  return useQuery({
    queryFn: getSubscriptionHistory,
    queryKey: subscriptionHistoryQueryKey,
  });
}

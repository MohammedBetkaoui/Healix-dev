"use client";

import { useQuery } from "@tanstack/react-query";

import { getSubscriptionPlans } from "../subscriptions.api";

export function useSubscriptionPlans(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: getSubscriptionPlans,
    queryKey: ["subscription", "plans"],
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getSubscriptionPlans } from "../subscriptions.api";

export function useSubscriptionPlans() {
  return useQuery({
    queryFn: getSubscriptionPlans,
    queryKey: ["subscription", "plans"],
  });
}

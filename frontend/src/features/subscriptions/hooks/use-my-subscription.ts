"use client";

import { useQuery } from "@tanstack/react-query";

import { getMySubscription } from "../subscriptions.api";

export function useMySubscription() {
  return useQuery({
    queryFn: getMySubscription,
    queryKey: ["subscription", "me"],
  });
}

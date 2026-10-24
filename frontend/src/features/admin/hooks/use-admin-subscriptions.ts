"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getAdminSubscriptionDetail,
  listAdminSubscriptions,
} from "../api/admin-subscriptions.api";
import { type AdminSubscriptionsQuery } from "../subscriptions.types";

export function useAdminSubscriptions(query: AdminSubscriptionsQuery) {
  return useQuery({
    queryFn: () => listAdminSubscriptions(query),
    queryKey: ["admin", "subscriptions", "list", query],
    retry: false,
    staleTime: 15_000,
  });
}

// Each fetch writes an ADMIN_VIEWED_SUBSCRIPTION audit entry server-side, so
// no retry (same as the other admin hooks).
export function useAdminSubscriptionDetail(accountId: string | null) {
  return useQuery({
    enabled: accountId !== null,
    queryFn: () => getAdminSubscriptionDetail(accountId as string),
    queryKey: ["admin", "subscriptions", "detail", accountId],
    retry: false,
  });
}

import { apiClient } from "@/lib/api/http-client";

import {
  type AdminQuotasInput,
  type AdminSubscriptionActionResponse,
  type AdminSubscriptionDetail,
  type AdminSubscriptionsQuery,
  type AdminSubscriptionsResponse,
} from "../subscriptions.types";
import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminSubscriptions(
  query: AdminSubscriptionsQuery,
): Promise<AdminSubscriptionsResponse> {
  const { data } = await apiClient.get<AdminSubscriptionsResponse>(
    "/admin/subscriptions",
    { params: cleanAdminQuery(query) },
  );

  return data;
}

export async function getAdminSubscriptionDetail(
  accountId: string,
): Promise<AdminSubscriptionDetail> {
  const { data } = await apiClient.get<AdminSubscriptionDetail>(
    `/admin/subscriptions/${accountId}`,
  );

  return data;
}

// Every action carries a reason (the backend refuses it under 5 characters,
// writes it in the history and the audit log), and rejects unknown keys.
export async function extendAdminTrial(
  accountId: string,
  input: { days: number; reason: string },
): Promise<AdminSubscriptionActionResponse> {
  const { data } = await apiClient.post<AdminSubscriptionActionResponse>(
    `/admin/subscriptions/${accountId}/extend-trial`,
    input,
  );

  return data;
}

export async function extendAdminSubscription(
  accountId: string,
  input: { days: number; reason: string },
): Promise<AdminSubscriptionActionResponse> {
  const { data } = await apiClient.post<AdminSubscriptionActionResponse>(
    `/admin/subscriptions/${accountId}/extend`,
    input,
  );

  return data;
}

export async function cancelAdminSubscription(
  accountId: string,
  input: { reason: string },
): Promise<AdminSubscriptionActionResponse> {
  const { data } = await apiClient.post<AdminSubscriptionActionResponse>(
    `/admin/subscriptions/${accountId}/cancel`,
    input,
  );

  return data;
}

// quotas: null goes back to the quotas of the plan.
export async function updateAdminSubscriptionQuotas(
  accountId: string,
  input: { quotas: AdminQuotasInput | null; reason: string },
): Promise<AdminSubscriptionActionResponse> {
  const { data } = await apiClient.patch<AdminSubscriptionActionResponse>(
    `/admin/subscriptions/${accountId}/quotas`,
    input,
  );

  return data;
}

export async function activateAdminCustomSubscription(
  accountId: string,
  input: {
    planId: string;
    quotas?: AdminQuotasInput;
    reason: string;
    until: string;
  },
): Promise<AdminSubscriptionActionResponse> {
  const { data } = await apiClient.post<AdminSubscriptionActionResponse>(
    `/admin/subscriptions/${accountId}/activate-custom`,
    input,
  );

  return data;
}

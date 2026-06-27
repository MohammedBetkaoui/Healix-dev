import { apiClient } from "@/lib/api/http-client";
import {
  type AdminVerificationDecisionResponse,
  type AdminVerificationDetailResponse,
  type AdminVerificationsQuery,
  type AdminVerificationsResponse,
} from "@/types/admin";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminVerifications(
  query: AdminVerificationsQuery,
): Promise<AdminVerificationsResponse> {
  const { data } = await apiClient.get<AdminVerificationsResponse>(
    "/admin/verifications",
    {
      params: cleanAdminQuery(query),
    },
  );

  return data;
}

export async function getAdminVerificationDetail(
  id: string,
): Promise<AdminVerificationDetailResponse> {
  const { data } = await apiClient.get<AdminVerificationDetailResponse>(
    `/admin/verifications/${id}`,
  );

  return data;
}

export async function approveAdminVerification(
  id: string,
  adminNote?: string,
): Promise<AdminVerificationDecisionResponse> {
  const { data } = await apiClient.patch<AdminVerificationDecisionResponse>(
    `/admin/verifications/${id}/approve`,
    { adminNote },
  );

  return data;
}

export async function rejectAdminVerification(
  id: string,
  reason: string,
  adminNote?: string,
): Promise<AdminVerificationDecisionResponse> {
  const { data } = await apiClient.patch<AdminVerificationDecisionResponse>(
    `/admin/verifications/${id}/reject`,
    { adminNote, reason },
  );

  return data;
}

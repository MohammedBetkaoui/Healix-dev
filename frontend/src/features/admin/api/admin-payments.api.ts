import { apiClient } from "@/lib/api/http-client";
import {
  type AdminPaymentDetail,
  type AdminPaymentReviewResponse,
  type AdminPaymentsQuery,
  type AdminPaymentsResponse,
} from "@/types/admin";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminPayments(
  query: AdminPaymentsQuery,
): Promise<AdminPaymentsResponse> {
  const { data } = await apiClient.get<AdminPaymentsResponse>(
    "/admin/payments",
    {
      params: cleanAdminQuery(query),
    },
  );

  return data;
}

export async function getAdminPaymentDetail(
  id: string,
): Promise<AdminPaymentDetail> {
  const { data } = await apiClient.get<AdminPaymentDetail>(
    `/admin/payments/${id}`,
  );

  return data;
}

// The backend rejects unknown keys (forbidNonWhitelisted), and an undefined
// adminNote is dropped by JSON serialization.
export async function approveAdminPayment(
  id: string,
  adminNote?: string,
): Promise<AdminPaymentReviewResponse> {
  const { data } = await apiClient.patch<AdminPaymentReviewResponse>(
    `/admin/payments/${id}/approve`,
    { adminNote },
  );

  return data;
}

export async function activateAdminCashPayment(
  id: string,
  adminNote?: string,
): Promise<AdminPaymentReviewResponse> {
  const { data } = await apiClient.patch<AdminPaymentReviewResponse>(
    `/admin/payments/${id}/activate-cash`,
    { adminNote },
  );

  return data;
}

export async function rejectAdminPayment(
  id: string,
  reason: string,
  adminNote?: string,
): Promise<AdminPaymentReviewResponse> {
  const { data } = await apiClient.patch<AdminPaymentReviewResponse>(
    `/admin/payments/${id}/reject`,
    { adminNote, reason },
  );

  return data;
}

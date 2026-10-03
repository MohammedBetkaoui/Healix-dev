import { apiClient } from "@/lib/api/http-client";
import {
  type AdminPaymentDetail,
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

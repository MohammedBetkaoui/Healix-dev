import { apiClient } from "@/lib/api/http-client";
import {
  type AdminUserDetailResponse,
  type AdminUsersQuery,
  type AdminUsersResponse,
  type AdminUserStatusChangeResult,
} from "@/types/admin";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminUsers(
  query: AdminUsersQuery,
): Promise<AdminUsersResponse> {
  const { data } = await apiClient.get<AdminUsersResponse>("/admin/users", {
    params: cleanAdminQuery(query),
  });

  return data;
}

export async function getAdminUserDetail(
  id: string,
): Promise<AdminUserDetailResponse> {
  const { data } = await apiClient.get<AdminUserDetailResponse>(
    `/admin/users/${id}`,
  );

  return data;
}

export async function suspendUser(
  id: string,
  reason: string,
): Promise<AdminUserStatusChangeResult> {
  const { data } = await apiClient.patch<AdminUserStatusChangeResult>(
    `/admin/users/${id}/suspend`,
    { reason },
  );

  return data;
}

export async function reactivateUser(
  id: string,
): Promise<AdminUserStatusChangeResult> {
  const { data } = await apiClient.patch<AdminUserStatusChangeResult>(
    `/admin/users/${id}/reactivate`,
  );

  return data;
}

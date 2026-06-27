import { apiClient } from "@/lib/api/http-client";
import { type AdminUsersQuery, type AdminUsersResponse } from "@/types/admin";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminUsers(
  query: AdminUsersQuery,
): Promise<AdminUsersResponse> {
  const { data } = await apiClient.get<AdminUsersResponse>("/admin/users", {
    params: cleanAdminQuery(query),
  });

  return data;
}

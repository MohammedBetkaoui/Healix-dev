import { apiClient } from "@/lib/api/http-client";

import { type AdminLogoutResponse } from "../types/admin-auth.types";

export async function adminLogout(): Promise<AdminLogoutResponse> {
  const { data } =
    await apiClient.post<AdminLogoutResponse>("/admin/auth/logout");

  return data;
}

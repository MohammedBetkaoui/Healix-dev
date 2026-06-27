import { apiClient } from "@/lib/api/http-client";

import {
  type AdminMeResponse,
  type AdminUser,
} from "../types/admin-auth.types";

export async function getCurrentAdmin(): Promise<AdminUser> {
  const { data } = await apiClient.get<AdminMeResponse>("/admin/auth/me");

  return data.admin;
}

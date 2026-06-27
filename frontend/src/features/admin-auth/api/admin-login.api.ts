import { apiClient } from "@/lib/api/http-client";

import {
  type AdminLoginPayload,
  type AdminLoginResponse,
} from "../types/admin-auth.types";

export async function adminLogin(
  payload: AdminLoginPayload,
): Promise<AdminLoginResponse> {
  // Admin tokens are stored only in secure httpOnly cookies by the backend.
  const { data } = await apiClient.post<AdminLoginResponse>(
    "/admin/auth/login",
    payload,
  );

  return data;
}

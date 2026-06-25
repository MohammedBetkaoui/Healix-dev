import { apiClient } from "@/lib/api/http-client";

import { type LogoutResponse } from "../types/login.types";

export async function logout(): Promise<LogoutResponse> {
  const response = await apiClient.post<LogoutResponse>("/auth/logout");
  return response.data;
}

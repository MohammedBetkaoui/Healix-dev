import { apiClient } from "@/lib/api/http-client";

import { type LoginPayload, type LoginResponse } from "../types/login.types";

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/auth/login", payload);
  return response.data;
}

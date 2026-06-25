import { apiClient } from "@/lib/api/http-client";

import { type LoginUser } from "../types/login.types";

type MeResponse = {
  user: LoginUser;
};

export async function getCurrentUser(): Promise<LoginUser> {
  const response = await apiClient.get<MeResponse>("/auth/me");
  return response.data.user;
}

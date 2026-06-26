import { apiClient } from "@/lib/api/http-client";

import { type LogoutResponse } from "../types/login.types";

async function clearLocalAuthCookies() {
  await fetch("/api/auth/local-logout", {
    credentials: "include",
    method: "POST",
  });
}

export async function logout(): Promise<LogoutResponse> {
  try {
    const response = await apiClient.post<LogoutResponse>("/auth/logout");
    await clearLocalAuthCookies();
    return response.data;
  } catch {
    // The backend logout is responsible for token revocation and audit logs.
    // This local fallback only removes browser cookies so a disconnected UI
    // cannot keep accessing protected frontend routes.
    await clearLocalAuthCookies();
    return {
      message: "Deconnexion locale effectuee.",
    };
  }
}

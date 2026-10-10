import { apiClient } from "@/lib/api/http-client";

type MessageResponse = { message: string };

export type ResetPasswordPayload = {
  confirmPassword: string;
  password: string;
  token: string;
};

// The answer is the same whether the address belongs to an account or not.
export async function requestPasswordReset(email: string): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/auth/forgot-password", { email });
  return response.data;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/auth/reset-password", payload);
  return response.data;
}

import { apiClient } from "@/lib/api/http-client";

import {
  type AccountProfile,
  type AccountSession,
  type ChangePasswordPayload,
  type ChangePasswordResult,
  type RevokeSessionsResult,
  type UpdateProfilePayload,
} from "../types/account.types";

export async function getAccountProfile() {
  const { data } = await apiClient.get<AccountProfile>("/account");
  return data;
}

export async function updateAccountProfile(payload: UpdateProfilePayload) {
  const { data } = await apiClient.patch<AccountProfile>("/account/profile", payload);
  return data;
}

export async function changeAccountPassword(payload: ChangePasswordPayload) {
  const { data } = await apiClient.post<ChangePasswordResult>("/account/password", payload);
  return data;
}

export async function listAccountSessions() {
  const { data } = await apiClient.get<AccountSession[]>("/account/sessions");
  return data;
}

export async function revokeAccountSession(id: string) {
  const { data } = await apiClient.delete<RevokeSessionsResult>(`/account/sessions/${encodeURIComponent(id)}`);
  return data;
}

export async function revokeOtherAccountSessions() {
  const { data } = await apiClient.post<RevokeSessionsResult>("/account/sessions/revoke-others");
  return data;
}

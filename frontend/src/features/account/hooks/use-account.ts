"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  changeAccountPassword,
  getAccountProfile,
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  updateAccountProfile,
} from "../api/account.api";
import { accountKeys } from "../account-query-keys";
import { type ChangePasswordPayload, type UpdateProfilePayload } from "../types/account.types";

export function useAccountProfile() {
  return useQuery({ queryFn: getAccountProfile, queryKey: accountKeys.profile, retry: false, staleTime: 30_000 });
}

export function useAccountSessions() {
  return useQuery({ queryFn: listAccountSessions, queryKey: accountKeys.sessions, retry: false, staleTime: 15_000 });
}

export function useUpdateAccountProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateAccountProfile(payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(accountKeys.profile, profile);
      // The name and the initials of the shell come from the current user.
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

// The other sessions are closed by the server: the list is read again.
export function useChangeAccountPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changeAccountPassword(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useRevokeAccountSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeAccountSession(id),
    // Also after a failure (the session was already gone): the list is read again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useRevokeOtherAccountSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOtherAccountSessions,
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

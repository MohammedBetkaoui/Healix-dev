"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import {
  type ApiErrorMessages,
  type NormalizedApiError,
  normalizeApiError,
} from "@/lib/api/api-error";

import { logout as logoutRequest } from "../api/logout.api";
import { type LogoutResponse } from "../types/login.types";

export function useLogout(messages?: ApiErrorMessages) {
  const router = useRouter();
  const { error, isPending, mutateAsync, reset } = useMutation<
    LogoutResponse,
    NormalizedApiError,
    void
  >({
    mutationFn: async () => {
      try {
        return await logoutRequest();
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
    onSuccess: () => {
      router.push("/login");
    },
  });

  const logout = useCallback(async () => {
    if (isPending) {
      return;
    }

    await mutateAsync();
  }, [isPending, mutateAsync]);

  return {
    error,
    errorMessage: error?.message,
    errorTitle: error?.title,
    isLoading: isPending,
    logout,
    reset,
  };
}

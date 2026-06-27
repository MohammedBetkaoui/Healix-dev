"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type ApiErrorMessages,
  type NormalizedApiError,
  normalizeApiError,
} from "@/lib/api/api-error";

import { adminLogin as adminLoginRequest } from "../api/admin-login.api";
import {
  type AdminLoginPayload,
  type AdminLoginResponse,
} from "../types/admin-auth.types";

export function useAdminLogin(
  messages: ApiErrorMessages,
  translatedSuccessMessage?: string,
) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { data, error, isPending, isSuccess, mutateAsync, reset } = useMutation<
    AdminLoginResponse,
    NormalizedApiError,
    AdminLoginPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await adminLoginRequest(payload);
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
    onSuccess: (response) => {
      setSuccessMessage(translatedSuccessMessage ?? response.message);
      window.setTimeout(() => {
        router.push(response.redirectTo);
      }, 160);
    },
  });

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const submitAdminLogin = useCallback(
    async (payload: AdminLoginPayload) => {
      if (isPending) {
        return Promise.reject<AdminLoginResponse>({
          admin: {
            accountStatus: "ACTIVE",
            email: "",
            fullName: "",
            id: "",
            role: "SUPER_ADMIN",
          },
          message: messages.generic,
          redirectTo: "",
        });
      }

      return mutateAsync(payload);
    },
    [isPending, messages.generic, mutateAsync],
  );

  return {
    admin: data?.admin,
    error,
    errorDetails: error?.details ?? [],
    errorMessage: error?.message,
    errorTitle: error?.title,
    isLoading: isPending,
    isSuccess,
    login: submitAdminLogin,
    reset,
    response: data,
    successMessage,
  };
}

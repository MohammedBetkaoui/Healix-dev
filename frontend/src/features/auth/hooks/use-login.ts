"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type ApiErrorMessages,
  type NormalizedApiError,
  normalizeApiError,
} from "@/lib/api/api-error";

import { login as loginRequest } from "../api/login.api";
import { type LoginPayload, type LoginResponse } from "../types/login.types";

export function useLogin(messages: ApiErrorMessages) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { data, error, isPending, isSuccess, mutateAsync, reset } = useMutation<
    LoginResponse,
    NormalizedApiError,
    LoginPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await loginRequest(payload);
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
    onSuccess: (response) => {
      setSuccessMessage(response.message);
      window.setTimeout(() => {
        router.push(response.redirectTo);
      }, 180);
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

  const submitLogin = useCallback(
    async (payload: LoginPayload) => {
      if (isPending) {
        return Promise.reject<LoginResponse>({
          message: messages.generic,
          redirectTo: "/login",
          user: {
            accountStatus: "",
            email: "",
            fullName: "",
            id: "",
            phone: "",
            role: "ESTABLISHMENT_ADMIN",
          },
        });
      }

      return mutateAsync(payload);
    },
    [isPending, messages.generic, mutateAsync],
  );

  return {
    error,
    errorDetails: error?.details ?? [],
    errorMessage: error?.message,
    errorTitle: error?.title,
    isLoading: isPending,
    isSuccess,
    login: submitLogin,
    reset,
    response: data,
    successMessage,
  };
}

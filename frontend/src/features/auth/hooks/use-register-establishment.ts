"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  type ApiErrorMessages,
  normalizeApiError,
} from "@/lib/api/api-error";

import { registerEstablishment } from "../api/register-establishment.api";
import {
  type EstablishmentRegisterPayload,
  type RegisterApiError,
  type RegisterEstablishmentResponse,
} from "../types/register.types";

export function useRegisterEstablishment(messages: ApiErrorMessages) {
  const {
    data,
    error,
    isPending,
    isSuccess,
    mutateAsync,
    reset,
  } = useMutation<
    RegisterEstablishmentResponse,
    RegisterApiError,
    EstablishmentRegisterPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await registerEstablishment(payload);
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
  });

  const submit = useCallback(
    async (payload: EstablishmentRegisterPayload) => {
      if (isPending) {
        return Promise.reject<RegisterEstablishmentResponse>({
          message: messages.generic,
        });
      }

      return mutateAsync(payload);
    },
    [isPending, messages.generic, mutateAsync],
  );

  return {
    data,
    error,
    errorDetails: error?.details ?? [],
    errorMessage: error?.message,
    errorTitle: error?.title,
    isLoading: isPending,
    isSuccess,
    registerEstablishment: submit,
    reset,
  };
}

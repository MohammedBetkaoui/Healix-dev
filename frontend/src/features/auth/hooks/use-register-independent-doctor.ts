"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  type ApiErrorMessages,
  normalizeApiError,
} from "@/lib/api/api-error";

import { registerIndependentDoctor } from "../api/register-independent-doctor.api";
import {
  type IndependentDoctorRegisterPayload,
  type RegisterApiError,
  type RegisterIndependentDoctorResponse,
} from "../types/register.types";

export function useRegisterIndependentDoctor(messages: ApiErrorMessages) {
  const {
    data,
    error,
    isPending,
    isSuccess,
    mutateAsync,
    reset,
  } = useMutation<
    RegisterIndependentDoctorResponse,
    RegisterApiError,
    IndependentDoctorRegisterPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await registerIndependentDoctor(payload);
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
  });

  const submit = useCallback(
    async (payload: IndependentDoctorRegisterPayload) => {
      if (isPending) {
        return Promise.reject<RegisterIndependentDoctorResponse>({
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
    registerIndependentDoctor: submit,
    reset,
  };
}

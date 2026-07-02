"use client";

import { useQuery } from "@tanstack/react-query";

import {
  type ApiErrorMessages,
  normalizeApiError,
} from "@/lib/api/api-error";

import { getCurrentUser } from "../api/me.api";

export function useCurrentUser(
  messages?: ApiErrorMessages,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await getCurrentUser();
      } catch (apiError) {
        throw normalizeApiError(apiError, messages);
      }
    },
    enabled: options?.enabled ?? false,
    retry: false,
  });
}

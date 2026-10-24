"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  type AdminActionForm,
  type AdminActionKind,
  submitAdminAction,
} from "../utils/subscription-actions";

// 409: the subscription is not in a state the action applies to (e.g. another
// administrator stopped it meanwhile).
export function isSubscriptionActionConflict(error: unknown) {
  return isAxiosError(error) && error.response?.status === 409;
}

// One mutation for the five actions of the console. The subscription, the
// accounts list, the user list and the dashboard counters change with it.
export function useAdminSubscriptionAction(accountId: string) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
    ]);
  };

  return useMutation({
    mutationFn: ({ form, kind }: { form: AdminActionForm; kind: AdminActionKind }) =>
      submitAdminAction(kind, accountId, form),
    onError: (error) => {
      // On a conflict the cached state is stale too.
      if (isSubscriptionActionConflict(error)) {
        void refresh();
      }
    },
    onSuccess: refresh,
  });
}

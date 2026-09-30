"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { suspendUser } from "../api/admin-users.api";

type SuspendUserVariables = {
  id: string;
  reason: string;
};

export function useSuspendUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: SuspendUserVariables) =>
      suspendUser(id, reason),
    onSuccess: () => {
      // Prefix of use-admin-users' ["admin", "users", query]: refreshes
      // every filtered variant of the list.
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

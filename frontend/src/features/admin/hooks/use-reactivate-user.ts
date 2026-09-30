"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { reactivateUser } from "../api/admin-users.api";

export function useReactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reactivateUser(id),
    onSuccess: () => {
      // Prefix of use-admin-users' ["admin", "users", query]: refreshes
      // every filtered variant of the list.
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

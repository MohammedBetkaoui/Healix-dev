"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { adminRoutes } from "@/config/admin-routes";

import { adminLogout } from "../api/admin-logout.api";

export function useAdminLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: adminLogout,
    onSettled: async () => {
      queryClient.removeQueries({ queryKey: ["admin"] });
      queryClient.removeQueries({ queryKey: ["admin-auth"] });
      router.replace(adminRoutes.login);
    },
  });
}

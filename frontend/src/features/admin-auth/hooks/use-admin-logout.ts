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
      await queryClient.invalidateQueries({ queryKey: ["admin-auth"] });
      router.push(adminRoutes.login);
    },
  });
}

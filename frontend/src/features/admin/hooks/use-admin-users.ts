"use client";

import { useQuery } from "@tanstack/react-query";

import { type AdminUsersQuery } from "@/types/admin";

import { listAdminUsers } from "../api/admin-users.api";

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryFn: () => listAdminUsers(query),
    queryKey: ["admin", "users", query],
    retry: false,
    staleTime: 15_000,
  });
}

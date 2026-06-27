"use client";

import { useQuery } from "@tanstack/react-query";

import { getCurrentAdmin } from "../api/admin-me.api";

export function useAdminCurrentUser() {
  return useQuery({
    queryFn: getCurrentAdmin,
    queryKey: ["admin-auth", "me"],
    retry: false,
    staleTime: 30_000,
  });
}

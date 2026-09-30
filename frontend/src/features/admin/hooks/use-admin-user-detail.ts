"use client";

import { useQuery } from "@tanstack/react-query";

import { getAdminUserDetail } from "../api/admin-users.api";

// Each fetch writes an ADMIN_VIEWED_USER audit entry server-side, so no
// retry (same as the other admin hooks); window-focus refetch is already
// disabled globally in app/providers.tsx.
export function useAdminUserDetail(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryFn: () => getAdminUserDetail(id as string),
    queryKey: ["admin", "users", "detail", id],
    retry: false,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getAdminDashboardOverview } from "../api/admin-dashboard.api";

export function useAdminDashboardOverview() {
  return useQuery({
    queryFn: getAdminDashboardOverview,
    queryKey: ["admin", "dashboard", "overview"],
    retry: false,
    staleTime: 20_000,
  });
}

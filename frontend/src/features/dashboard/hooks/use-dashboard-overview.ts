"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getDashboardOverview } from "../dashboard.api";

// Every figure of the doctor and establishment dashboards, in one call. The
// previous period stays on screen while another one loads.
export function useDashboardOverview(days: number) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getDashboardOverview(days),
    queryKey: ["dashboard", "overview", { days }],
    retry: false,
  });
}

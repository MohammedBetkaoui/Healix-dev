"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type ModelMonitoringParams } from "@/features/ai-analyses/model-monitoring";

import { getAdminModelMonitoring } from "../api/admin-ai-monitoring.api";

export function useAdminModelMonitoring(params: ModelMonitoringParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getAdminModelMonitoring(params),
    queryKey: ["admin", "ai-model-monitoring", params],
    retry: false,
    staleTime: 60_000,
  });
}

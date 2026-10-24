"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getModelMonitoring } from "../ai-analysis-runs.api";
import { type ModelMonitoringParams } from "../model-monitoring";

// The monitoring board of the workspace; the previous period stays shown
// while another loads.
export function useModelMonitoring(params: ModelMonitoringParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getModelMonitoring(params),
    queryKey: ["ai-analysis-runs", "model-monitoring", params],
    retry: false,
    staleTime: 60_000,
  });
}

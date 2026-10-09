"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getAiRunsOverview,
  getAiRunsSummary,
  type AiRunsListParams,
  type AiRunsPeriodParams,
} from "../ai-analysis-runs.api";

// The runs of every patient in scope; the previous page stays shown while
// the next one loads.
export function useAiRunsOverview(params: AiRunsListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => getAiRunsOverview(params),
    queryKey: ["ai-analysis-runs", "list", params],
    retry: false,
  });
}

export function useAiRunsSummary(params: AiRunsPeriodParams) {
  return useQuery({
    queryFn: () => getAiRunsSummary(params),
    queryKey: ["ai-analysis-runs", "summary", params],
    retry: false,
  });
}

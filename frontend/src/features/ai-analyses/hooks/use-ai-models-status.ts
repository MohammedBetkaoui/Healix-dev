"use client";

import { useQuery } from "@tanstack/react-query";

import { getAiServiceStatus } from "../ai-analysis-runs.api";

// Whether the inference service is reachable and which models it loaded.
// Refreshed on each mount: the launch button depends on it.
export function useAiModelsStatus(options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryFn: getAiServiceStatus,
    queryKey: ["ai-models", "status"],
    refetchOnMount: "always",
    retry: false,
    staleTime: 15_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { getAiTimeline } from "../ai-analysis-runs.api";
import { type AiPipelineId } from "../ai-analyses.types";

// The evolution of one chain. Under the key of the patient's runs
// (["patients", "ai-analysis-runs", patientId]): a new analysis or a decision
// invalidates the list, and the timeline with it.
export function useAiTimeline(patientId: string, pipeline: AiPipelineId, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: (options.enabled ?? true) && Boolean(patientId),
    queryFn: () => getAiTimeline(patientId, pipeline),
    queryKey: ["patients", "ai-analysis-runs", patientId, "timeline", pipeline],
    retry: false,
  });
}

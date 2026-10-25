"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getAiAnalysisRun,
  getAiAnalysisRunEcgTrace,
  getAiAnalysisRunMask,
  getAiAnalysisRunOverlay,
  getAiAnalysisRunSlice,
  getAiAnalysisVolumeImage,
  getCardioEvaluation,
  getCardioSegEvaluation,
  getCardioVolumeEvaluation,
} from "../ai-analysis-runs.api";
import { type VolumetryImagePhase } from "../volumetry";

const RUNNING_POLL_MS = 3_000;

// One run; polled while the backend still reports it RUNNING.
export function useAiAnalysisRun(patientId: string, runId: string) {
  return useQuery({
    enabled: Boolean(patientId) && Boolean(runId),
    queryFn: () => getAiAnalysisRun(patientId, runId),
    queryKey: ["patients", "ai-analysis-runs", patientId, runId],
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? RUNNING_POLL_MS : false),
    retry: false,
  });
}

// The segmentation mask (PNG). Fetched once, dropped when nothing shows it.
export function useAiAnalysisRunMask(patientId: string, runId: string, options: { enabled: boolean }) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 0,
    queryFn: () => getAiAnalysisRunMask(patientId, runId),
    queryKey: ["patients", "ai-analysis-run-mask", patientId, runId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// The trace of an ECG run (JSON, 12 leads). Same lifetime as the mask.
export function useAiAnalysisRunEcgTrace(patientId: string, runId: string, options: { enabled: boolean }) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 0,
    queryFn: () => getAiAnalysisRunEcgTrace(patientId, runId),
    queryKey: ["patients", "ai-analysis-run-ecg-trace", patientId, runId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// The ECG model's figures for the weights of a run: they do not change.
export function useCardioEvaluation(weightsSha256: string | null) {
  return useQuery({
    enabled: Boolean(weightsSha256),
    queryFn: () => getCardioEvaluation(weightsSha256 as string),
    queryKey: ["ai-models", "cardio-ecg", "evaluation", weightsSha256],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCardioSegEvaluation(weightsSha256: string | null) {
  return useQuery({
    enabled: Boolean(weightsSha256),
    queryFn: () => getCardioSegEvaluation(weightsSha256 as string),
    queryKey: ["ai-models", "cardio-seg", "evaluation", weightsSha256],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCardioVolumeEvaluation(weightsSha256: string | null) {
  return useQuery({
    enabled: Boolean(weightsSha256),
    queryFn: () => getCardioVolumeEvaluation(weightsSha256 as string),
    queryKey: ["ai-models", "cardio-volume", "evaluation", weightsSha256],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// One image of a cine volumetry (a slice of the model's ED or ES, or its overlay). The slider goes back
// and forth over the same slices: kept for a minute once nothing shows it.
export function useAiAnalysisVolumeImage(
  patientId: string,
  runId: string,
  kind: "mask" | "overlay" | "slice",
  phase: VolumetryImagePhase,
  slice: number,
  options: { enabled: boolean },
) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 60_000,
    queryFn: () => getAiAnalysisVolumeImage(patientId, runId, kind, phase, slice),
    queryKey: ["patients", "ai-analysis-run-volume-image", patientId, runId, kind, phase, slice],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// The colour overlay of a nuclei map (PNG). Same lifetime as the mask.
export function useAiAnalysisRunOverlay(patientId: string, runId: string, options: { enabled: boolean }) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 0,
    queryFn: () => getAiAnalysisRunOverlay(patientId, runId),
    queryKey: ["patients", "ai-analysis-run-overlay", patientId, runId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAiAnalysisRunSlice(patientId: string, runId: string, options: { enabled: boolean }) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(runId),
    gcTime: 0,
    queryFn: () => getAiAnalysisRunSlice(patientId, runId),
    queryKey: ["patients", "ai-analysis-run-slice", patientId, runId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

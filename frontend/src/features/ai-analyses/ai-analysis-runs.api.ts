import { isAxiosError } from "axios";

import { apiClient } from "@/lib/api/http-client";

import {
  type AiAnalysisRun,
  type AiEcgTrace,
  type AiMagnification,
  type AiPipelineId,
  type AiRunDecision,
  type AiPriorityLevel,
  type AiRunDecisionFilter,
  type AiRunsPage,
  type AiRunsSummary,
  type AiServiceStatus,
  type CardioEvaluation,
  type CardioSegEvaluation,
  type EcgClass,
  type EcgUnit,
} from "./ai-analyses.types";
import { type AiTimeline } from "./ai-timeline";
import { type ModelMonitoring, type ModelMonitoringParams } from "./model-monitoring";

// The backend waits up to 60 s for the inference service: the default 10 s
// client timeout would abort a valid analysis.
export const ANALYSIS_REQUEST_TIMEOUT_MS = 75_000;
// The first request renders the PDF (Chromium may have to start).
const REPORT_REQUEST_TIMEOUT_MS = 60_000;

export type CreateAiAnalysisRunPayload = {
  pipeline: AiPipelineId;
  sourceDocumentId: string;
  clinicianImpression?: string;
  /** Pathology only: the slide magnification (40 for the nuclei map); never sent for brain. */
  magnification?: AiMagnification;
  /** ECG only: the sampling rate of a CSV/TXT signal, in Hz (a WFDB header has its own). */
  samplingRate?: number;
  /** ECG only: the unit of a CSV/TXT signal; mV when absent. */
  unit?: EcgUnit;
};

/** GET /ai-analysis-runs: the runs of every patient in scope. */
export type AiRunsListParams = {
  decision?: AiRunDecisionFilter;
  status?: AiAnalysisRun["status"];
  pipeline?: AiPipelineId;
  /** ISO instants, both included. */
  from?: string;
  to?: string;
  requestedBy?: "me";
  /** "priority": the runs waiting for a decision in reading order, then the others; the date by default. */
  sort?: "priority";
  /** Only this reading priority; implies the priority order. */
  priority?: AiPriorityLevel;
  page?: number;
  limit?: number;
};

export type AiRunsPeriodParams = { from?: string; to?: string };

export async function getAiRunsOverview(params: AiRunsListParams): Promise<AiRunsPage> {
  const response = await apiClient.get<AiRunsPage>("/ai-analysis-runs", { params });
  return response.data;
}

export async function getAiRunsSummary(params: AiRunsPeriodParams): Promise<AiRunsSummary> {
  const response = await apiClient.get<AiRunsSummary>("/ai-analysis-runs/summary", { params });
  return response.data;
}

/** GET /ai-analysis-runs/model-monitoring: how the workspace's physicians judge each model, per month. */
export async function getModelMonitoring(params: ModelMonitoringParams): Promise<ModelMonitoring> {
  const response = await apiClient.get<ModelMonitoring>("/ai-analysis-runs/model-monitoring", { params });
  return response.data;
}

/** GET /patients/:id/ai-timeline: the SUCCEEDED runs of one chain, oldest first, with their comparable measures. */
export async function getAiTimeline(patientId: string, pipeline: AiPipelineId): Promise<AiTimeline> {
  const response = await apiClient.get<AiTimeline>(`/patients/${patientId}/ai-timeline`, { params: { pipeline } });
  return response.data;
}

export async function getAiServiceStatus(): Promise<AiServiceStatus> {
  const response = await apiClient.get<AiServiceStatus>("/ai-models/status");
  return response.data;
}

export async function createAiAnalysisRun(
  patientId: string,
  payload: CreateAiAnalysisRunPayload,
): Promise<AiAnalysisRun> {
  const response = await apiClient.post<AiAnalysisRun>(
    `/patients/${patientId}/ai-analysis-runs`,
    payload,
    { timeout: ANALYSIS_REQUEST_TIMEOUT_MS },
  );
  return response.data;
}

export type DecideAiAnalysisRunPayload = {
  status: AiRunDecision;
  /** CORRECTED only (not an ECG). */
  correctedLabel?: string;
  /** ECG, CORRECTED only: the classes kept, NORM alone or without it. */
  correctedLabels?: EcgClass[];
  /** Required for CORRECTED and REJECTED. */
  reason?: string;
};

/** The patient's runs, most recent first. */
export async function getAiAnalysisRuns(patientId: string): Promise<AiAnalysisRun[]> {
  const response = await apiClient.get<AiAnalysisRun[]>(`/patients/${patientId}/ai-analysis-runs`);
  return response.data;
}

export async function getAiAnalysisRun(patientId: string, runId: string): Promise<AiAnalysisRun> {
  const response = await apiClient.get<AiAnalysisRun>(`/patients/${patientId}/ai-analysis-runs/${runId}`);
  return response.data;
}

/** Final: 409 AI_RUN_ALREADY_DECIDED on a second decision. */
export async function decideAiAnalysisRun(
  patientId: string,
  runId: string,
  payload: DecideAiAnalysisRunPayload,
): Promise<AiAnalysisRun> {
  const response = await apiClient.post<AiAnalysisRun>(
    `/patients/${patientId}/ai-analysis-runs/${runId}/decision`,
    payload,
  );
  return response.data;
}

/**
 * The PDF report of a validated or corrected run (generated on the first
 * request, then served as stored). Asked as a blob, an error body is a blob
 * too: it is read back as JSON so its code (AI_REPORT_NOT_AVAILABLE,
 * VERIFICATION_REQUIRED...) can be told apart.
 */
export async function getAiAnalysisReport(patientId: string, runId: string): Promise<Blob> {
  try {
    const response = await apiClient.get<Blob>(`/patients/${patientId}/ai-analysis-runs/${runId}/report`, {
      responseType: "blob",
      timeout: REPORT_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        // Not JSON: left as it was.
      }
    }
    throw error;
  }
}

export async function getAiAnalysisRunMask(patientId: string, runId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/patients/${patientId}/ai-analysis-runs/${runId}/mask`, {
    responseType: "blob",
  });
  return response.data;
}

/** The trace of an ECG run: the first 10 s, filtered, in mV, per lead. */
export async function getAiAnalysisRunEcgTrace(patientId: string, runId: string): Promise<AiEcgTrace> {
  const response = await apiClient.get<AiEcgTrace>(`/patients/${patientId}/ai-analysis-runs/${runId}/ecg-trace`);
  return response.data;
}

/** The figures of the ECG model for these weights (service, else notebook), or null. */
export async function getCardioEvaluation(weightsSha256: string): Promise<CardioEvaluation | null> {
  const response = await apiClient.get<{ evaluation: CardioEvaluation | null }>(
    `/ai-models/cardio-ecg/evaluation/${encodeURIComponent(weightsSha256)}`,
  );
  return response.data.evaluation;
}

/** The figures of the cardiac MRI model for these weights (service, else model card). */
export async function getCardioSegEvaluation(weightsSha256: string): Promise<CardioSegEvaluation | null> {
  const response = await apiClient.get<{ evaluation: CardioSegEvaluation | null }>(
    `/ai-models/cardio-seg/evaluation/${encodeURIComponent(weightsSha256)}`,
  );
  return response.data.evaluation;
}

/** The colour overlay of a nuclei map (PNG, background transparent). */
export async function getAiAnalysisRunOverlay(patientId: string, runId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/patients/${patientId}/ai-analysis-runs/${runId}/overlay`, {
    responseType: "blob",
  });
  return response.data;
}

/** The cardiac MRI slice as analysed, converted to an 8-bit PNG. */
export async function getAiAnalysisRunSlice(patientId: string, runId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/patients/${patientId}/ai-analysis-runs/${runId}/slice`, {
    responseType: "blob",
  });
  return response.data;
}

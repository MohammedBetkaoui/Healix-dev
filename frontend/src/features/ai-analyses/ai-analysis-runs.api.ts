import { isAxiosError } from "axios";

import { apiClient } from "@/lib/api/http-client";

import {
  type AiAnalysisRun,
  type AiPipelineId,
  type AiRunDecision,
  type AiRunDecisionFilter,
  type AiRunsPage,
  type AiRunsSummary,
  type AiServiceStatus,
} from "./ai-analyses.types";

// The backend waits up to 60 s for the inference service: the default 10 s
// client timeout would abort a valid analysis.
const ANALYSIS_REQUEST_TIMEOUT_MS = 75_000;
// The first request renders the PDF (Chromium may have to start).
const REPORT_REQUEST_TIMEOUT_MS = 60_000;

export type CreateAiAnalysisRunPayload = {
  pipeline: AiPipelineId;
  sourceDocumentId: string;
  clinicianImpression?: string;
};

/** GET /ai-analysis-runs: the runs of every patient in scope. */
export type AiRunsListParams = {
  decision?: AiRunDecisionFilter;
  status?: AiAnalysisRun["status"];
  /** ISO instants, both included. */
  from?: string;
  to?: string;
  requestedBy?: "me";
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
  /** CORRECTED only. */
  correctedLabel?: string;
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

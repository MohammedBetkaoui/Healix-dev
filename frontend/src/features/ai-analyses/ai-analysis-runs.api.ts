import { apiClient } from "@/lib/api/http-client";

import {
  type AiAnalysisRun,
  type AiPipelineId,
  type AiRunDecision,
  type AiServiceStatus,
} from "./ai-analyses.types";

// The backend waits up to 60 s for the inference service: the default 10 s
// client timeout would abort a valid analysis.
const ANALYSIS_REQUEST_TIMEOUT_MS = 75_000;

export type CreateAiAnalysisRunPayload = {
  pipeline: AiPipelineId;
  sourceDocumentId: string;
  clinicianImpression?: string;
};

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

export async function getAiAnalysisRunMask(patientId: string, runId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/patients/${patientId}/ai-analysis-runs/${runId}/mask`, {
    responseType: "blob",
  });
  return response.data;
}

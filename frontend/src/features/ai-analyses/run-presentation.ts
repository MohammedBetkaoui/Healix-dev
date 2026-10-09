// Pure presentation rules of the brain analysis (launch button, result page).

import { isAxiosError } from "axios";

import { type AiRunPrediction, type AiServiceStatus } from "./ai-analyses.types";

/** Descending probability, on a copy. */
export function sortPredictions(predictions: readonly AiRunPrediction[]): AiRunPrediction[] {
  return [...predictions].sort((a, b) => b.probability - a.probability);
}

export function getTopLabel(predictions: readonly AiRunPrediction[] | null): string | null {
  return predictions && predictions.length > 0 ? sortPredictions(predictions)[0].label : null;
}

export type LaunchState =
  | "loading"
  | "ready"
  | "status_error"
  | "service_unavailable"
  | "service_not_configured"
  | "service_unauthorized"
  | "service_error"
  | "classifier_not_loaded";

/** "ready" only when the service answers and has the classifier loaded. */
export function getLaunchState(
  query: { data: AiServiceStatus | undefined; isError: boolean; isLoading: boolean },
  classifierId: string,
): LaunchState {
  if (query.isLoading) return "loading";
  if (query.isError || !query.data) return "status_error";

  switch (query.data.service) {
    case "unavailable":
      return "service_unavailable";
    case "not_configured":
      return "service_not_configured";
    case "unauthorized":
      return "service_unauthorized";
    case "error":
      return "service_error";
    case "available":
      return query.data.models.some((model) => model.modelId === classifierId && model.loaded)
        ? "ready"
        : "classifier_not_loaded";
  }
}

/** First 12 hex characters of a SHA-256, enough to tell weights apart on screen. */
export function shortSha256(sha256: string | null): string | null {
  return sha256 ? sha256.slice(0, 12) : null;
}

/** errorCode values the result page explains (aiAnalyses.run.errors.<code>). */
export const knownRunErrorCodes = [
  "SERVICE_UNAVAILABLE",
  "SERVICE_TIMEOUT",
  "MODEL_NOT_LOADED",
  "SERVICE_NOT_CONFIGURED",
  "SERVICE_ERROR",
  "MASK_STORAGE_FAILED",
  "RUN_INTERRUPTED",
  "INVALID_IMAGE",
  "IMAGE_TOO_LARGE",
] as const;
const KNOWN_RUN_ERRORS = new Set<string>(knownRunErrorCodes);

/** Key under aiAnalyses.run.errors for a run errorCode. */
export function getRunErrorKey(errorCode: string | null): string {
  return errorCode && KNOWN_RUN_ERRORS.has(errorCode) ? errorCode : "unknown";
}

/**
 * The run a failed POST still recorded (rejected image, unavailable service…):
 * the backend puts its id in the error body, the result page shows the state.
 */
export function getFailedRunId(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const runId = (error.response?.data as { runId?: unknown } | undefined)?.runId;
  return typeof runId === "string" && runId !== "" ? runId : null;
}

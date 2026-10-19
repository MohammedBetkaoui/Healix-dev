// Pure presentation rules of an analysis (launch button, result page).

import { isAxiosError } from "axios";

import { type Locale } from "@/i18n";

import {
  type AiAnalysisRun,
  type AiCardioSegPredictions,
  type AiEcgPredictions,
  type AiRunPrediction,
  type AiServiceStatus,
} from "./ai-analyses.types";

type StoredPredictions = readonly AiRunPrediction[] | AiEcgPredictions | AiCardioSegPredictions | null | undefined;

/** Descending probability, on a copy; none for the predictions of an ECG (an object). */
export function sortPredictions(predictions: StoredPredictions): AiRunPrediction[] {
  return Array.isArray(predictions) ? [...predictions].sort((a, b) => b.probability - a.probability) : [];
}

export function getTopLabel(predictions: StoredPredictions): string | null {
  return sortPredictions(predictions)[0]?.label ?? null;
}

/** The probabilities, thresholds and positive classes of an ECG run; null otherwise. */
export function getEcgPredictions(run: Pick<AiAnalysisRun, "pipeline" | "predictions">): AiEcgPredictions | null {
  const stored = run.predictions;
  return run.pipeline === "cardio-ecg" && stored && !Array.isArray(stored) && "probabilities" in stored ? stored : null;
}

/** The areas and spacing of a cardiac MRI segmentation; null otherwise. */
export function getCardioSegPredictions(
  run: Pick<AiAnalysisRun, "pipeline" | "predictions">,
): AiCardioSegPredictions | null {
  const stored = run.predictions;
  return run.pipeline === "cardio-seg-mri" && stored && !Array.isArray(stored) && "structures" in stored ? stored : null;
}

export type LaunchState =
  | "loading"
  | "ready"
  | "status_error"
  | "service_unavailable"
  | "service_not_configured"
  | "service_unauthorized"
  | "service_error"
  | "model_not_loaded";

/** "ready" only when the service answers and has the chain's entry model loaded. */
export function getLaunchState(
  query: { data: AiServiceStatus | undefined; isError: boolean; isLoading: boolean },
  entryModelId: string,
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
      return query.data.models.some((model) => model.modelId === entryModelId && model.loaded)
        ? "ready"
        : "model_not_loaded";
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
  "IMAGE_TOO_SMALL",
  "IMAGE_DIMENSIONS_TOO_LARGE",
  // A refused ECG signal (ai-service/app/ecg_input.py).
  "ECG_UNSUPPORTED_FORMAT",
  "ECG_UNSAFE_ARCHIVE",
  "ECG_MISSING_LEADS",
  "ECG_SAMPLING_RATE_REQUIRED",
  "ECG_SAMPLING_RATE_INVALID",
  "ECG_UNIT_INVALID",
  "ECG_TOO_SHORT",
  "ECG_TOO_LONG",
  "ECG_NON_FINITE",
  "ECG_FLAT_LEAD",
  "ECG_AMPLITUDE_OUT_OF_RANGE",
  "ECG_FILE_TOO_LARGE",
  "CARDIO_SEG_NOT_GRAYSCALE",
  "CARDIO_SEG_MULTIFRAME",
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

/** 400 codes of POST .../ai-analysis-runs the wizard explains (aiAnalyses.wizard.reading.launchErrors.<code>). */
export const knownLaunchErrorCodes = [
  "AI_MAGNIFICATION_REQUIRED",
  "AI_MAGNIFICATION_NOT_SUPPORTED",
  "AI_MAGNIFICATION_UNEXPECTED",
  "AI_SAMPLING_RATE_REQUIRED",
  "AI_ECG_OPTIONS_UNEXPECTED",
  "AI_UNSUPPORTED_DOCUMENT",
] as const;
const KNOWN_LAUNCH_ERRORS = new Set<string>(knownLaunchErrorCodes);

/** Key under aiAnalyses.wizard.reading.launchErrors, or null for the generic message. */
export function getLaunchErrorKey(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && KNOWN_LAUNCH_ERRORS.has(code) ? code : null;
}

export type EcgRejection = {
  /** A known ECG_* code (aiAnalyses.ecg.rejections.<code>). */
  code: (typeof knownRunErrorCodes)[number];
  details: Record<string, unknown>;
};

/**
 * A signal the service refused (422 AI_INPUT_REJECTED, reason ECG_*): the
 * wizard says why and stays open, so the rate or the unit can be fixed.
 */
export function getEcgRejection(error: unknown): EcgRejection | null {
  if (!isAxiosError(error)) return null;
  const body = error.response?.data as { code?: unknown; reason?: unknown; details?: unknown } | undefined;
  if (body?.code !== "AI_INPUT_REJECTED" || typeof body.reason !== "string" || !body.reason.startsWith("ECG_")) {
    return null;
  }
  if (!KNOWN_RUN_ERRORS.has(body.reason)) return null;
  const details = body.details && typeof body.details === "object" ? (body.details as Record<string, unknown>) : {};
  return { code: body.reason as EcgRejection["code"], details };
}

const leadList = (value: unknown) =>
  Array.isArray(value) ? value.filter((lead) => typeof lead === "string").join(", ") : "";

/** The values a rejection message names: leads, durations, limits. */
export function ecgRejectionParams(details: Record<string, unknown>, locale: Locale): Record<string, string> {
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1 });
  const format = (value: unknown) => (typeof value === "number" ? number.format(value) : "");
  return {
    duration: format(details.durationSeconds),
    leads: leadList(details.missing) || leadList(details.leads),
    max: format(details.maxSeconds ?? details.max),
    min: format(details.minSeconds ?? details.min),
  };
}

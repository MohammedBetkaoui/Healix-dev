// Pure rules of the physician's decision on a run (result page, patient record).
// Mirrors backend/src/ai-analysis-runs (decide, DecideAiAnalysisRunDto).

import { isAxiosError } from "axios";

import { type DashboardStatusTone } from "@/types/dashboard";

import {
  type AiAnalysisRun,
  type AiOutputClassKey,
  type AiRunDecision,
} from "./ai-analyses.types";
import { type DecideAiAnalysisRunPayload } from "./ai-analysis-runs.api";
import { getTopLabel } from "./run-presentation";

/** Classes a correction may name: the classifier's four, or one it does not know. */
export const aiDecisionLabels = [
  "glioma",
  "meningioma",
  "notumor",
  "pituitary",
  "other",
] as const satisfies readonly AiOutputClassKey[];

export const DECISION_REASON_MIN_LENGTH = 5;
export const DECISION_REASON_MAX_LENGTH = 500;

/** Explicit text and status colour; never the specialty colour. */
export const decisionTones: Record<AiRunDecision, DashboardStatusTone> = {
  VALIDATED: "success",
  CORRECTED: "warning",
  REJECTED: "danger",
};

type DecisionFields = Pick<AiAnalysisRun, "decisionLabel" | "decisionStatus" | "predictions">;

export type DecisionAgreement = "pending" | "agrees" | "disagrees" | "rejected";

/** Whether the physician retained the model's top class. */
export function getDecisionAgreement(run: DecisionFields): DecisionAgreement {
  if (run.decisionStatus === null) return "pending";
  if (run.decisionStatus === "REJECTED") return "rejected";
  const modelLabel = getTopLabel(run.predictions);
  return run.decisionLabel !== null && run.decisionLabel === modelLabel ? "agrees" : "disagrees";
}

export type DisplayedLabel =
  /** VALIDATED or CORRECTED: the class the physician retained. */
  | { source: "physician"; label: string }
  /** No decision yet: the model's top class, to show as not validated. */
  | { source: "model"; label: string }
  /** Rejected, or nothing to show. */
  | { source: "none"; label: null };

/** The class to show for a run: the physician's once decided, never the model's over it. */
export function getDisplayedLabel(run: DecisionFields): DisplayedLabel {
  if (run.decisionStatus === "REJECTED") return { label: null, source: "none" };
  if (run.decisionStatus !== null) {
    return run.decisionLabel ? { label: run.decisionLabel, source: "physician" } : { label: null, source: "none" };
  }
  const modelLabel = getTopLabel(run.predictions);
  return modelLabel ? { label: modelLabel, source: "model" } : { label: null, source: "none" };
}

/** Most recent run (by analysis date) the physician validated or corrected. */
export function getLatestRetainedRun<T extends Pick<AiAnalysisRun, "createdAt" | "decisionStatus">>(
  runs: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const run of runs) {
    if (run.decisionStatus !== "VALIDATED" && run.decisionStatus !== "CORRECTED") continue;
    if (latest === null || Date.parse(run.createdAt) > Date.parse(latest.createdAt)) latest = run;
  }
  return latest;
}

/** Corrections offered: every decision label except the model's top class. */
export function getCorrectionOptions(modelLabel: string | null): string[] {
  return aiDecisionLabels.filter((label) => label !== modelLabel);
}

/** As the backend stores it: trimmed, inner whitespace collapsed. */
export function normalizeDecisionReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

export type DecisionDraft = {
  status: AiRunDecision | null;
  correctedLabel: string;
  reason: string;
};

export type DecisionDraftErrors = {
  status?: "required";
  correctedLabel?: "required" | "matchesModel";
  reason?: "required" | "tooShort" | "tooLong";
};

/** Same rules as the backend; an empty object means the draft can be sent. */
export function validateDecisionDraft(draft: DecisionDraft, modelLabel: string | null): DecisionDraftErrors {
  if (draft.status === null) return { status: "required" };
  if (draft.status === "VALIDATED") return {};

  const errors: DecisionDraftErrors = {};
  if (draft.status === "CORRECTED") {
    if (!(aiDecisionLabels as readonly string[]).includes(draft.correctedLabel)) errors.correctedLabel = "required";
    else if (draft.correctedLabel === modelLabel) errors.correctedLabel = "matchesModel";
  }

  const length = normalizeDecisionReason(draft.reason).length;
  if (length === 0) errors.reason = "required";
  else if (length < DECISION_REASON_MIN_LENGTH) errors.reason = "tooShort";
  else if (length > DECISION_REASON_MAX_LENGTH) errors.reason = "tooLong";

  return errors;
}

/** The body of POST .../decision: a validation carries no reason nor class. */
export function toDecisionPayload(draft: DecisionDraft & { status: AiRunDecision }): DecideAiAnalysisRunPayload {
  switch (draft.status) {
    case "VALIDATED":
      return { status: "VALIDATED" };
    case "CORRECTED":
      return { correctedLabel: draft.correctedLabel, reason: normalizeDecisionReason(draft.reason), status: "CORRECTED" };
    case "REJECTED":
      return { reason: normalizeDecisionReason(draft.reason), status: "REJECTED" };
  }
}

/** Error codes of POST .../decision the panel explains (aiAnalyses.decision.errors.<code>). */
export const knownDecisionErrorCodes = [
  "AI_RUN_ALREADY_DECIDED",
  "AI_RUN_NOT_DECIDABLE",
  "AI_CORRECTION_MATCHES_MODEL",
  "AI_CORRECTED_LABEL_UNEXPECTED",
] as const;
const KNOWN_DECISION_ERRORS = new Set<string>(knownDecisionErrorCodes);

/** Key under aiAnalyses.decision.errors for a failed decision. */
export function getDecisionErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && KNOWN_DECISION_ERRORS.has(code) ? code : "unknown";
}

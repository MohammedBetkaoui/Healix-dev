// Pure rules of the physician's decision on a run (result page, patient record).
// Mirrors backend/src/ai-analysis-runs (decide, DecideAiAnalysisRunDto).

import { isAxiosError } from "axios";

import { type DashboardStatusTone } from "@/types/dashboard";

import {
  aiRunDecisions,
  ecgClasses,
  type AiAnalysisRun,
  type AiOutputClassKey,
  type AiPipelineId,
  type AiRunDecision,
  type EcgClass,
} from "./ai-analyses.types";
import { type DecideAiAnalysisRunPayload } from "./ai-analysis-runs.api";
import { getTopLabel } from "./run-presentation";

/**
 * Classes a correction may name, per chain (backend CORRECTION_LABELS): the
 * model's own, or one it does not know. A nuclei map is never corrected. An
 * ECG is corrected to a set of classes (ecgClasses), not to one.
 */
export const correctionLabels = {
  brain: ["glioma", "meningioma", "notumor", "pituitary", "other"],
  "pathology-breast": ["benign", "malignant", "other"],
  "pathology-nuclei": [],
  "cardio-ecg": [],
  "cardio-seg-mri": [],
  // Measures, not a class: a correction is made on the measures (volumetry.ts).
  "cardio-volume-mri": [],
} as const satisfies Record<AiPipelineId, readonly AiOutputClassKey[]>;

/** Every class a decision may retain, whatever the chain. */
export const aiDecisionLabels: readonly AiOutputClassKey[] = [
  ...new Set<AiOutputClassKey>([...Object.values(correctionLabels).flat(), ...ecgClasses]),
];

/** "Normal" excludes every other class of the ECG. */
export const ECG_NORMAL_CLASS: EcgClass = "NORM";

/** In class order, never two of the same. */
export function sortEcgLabels(labels: readonly string[]): EcgClass[] {
  return ecgClasses.filter((label) => labels.includes(label));
}

/** A class ticked or unticked: NORM clears the others, any other clears NORM. */
export function toggleEcgLabel(current: readonly EcgClass[], label: EcgClass): EcgClass[] {
  if (current.includes(label)) return current.filter((value) => value !== label);
  if (label === ECG_NORMAL_CLASS) return [ECG_NORMAL_CLASS];
  return sortEcgLabels([...current.filter((value) => value !== ECG_NORMAL_CLASS), label]);
}

const sameLabels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((label) => b.includes(label));

/**
 * The decisions a chain offers: a segmentation map is validated or rejected, never
 * corrected. The measures of a cine are validated as the model gave them, or
 * corrected once the physician changed them (ED, ES, the slices counted), or rejected.
 */
export function getDecisionOptions(pipeline: AiPipelineId, volumetryModified = false): readonly AiRunDecision[] {
  if (pipeline === "cardio-volume-mri") return volumetryModified ? ["CORRECTED", "REJECTED"] : ["VALIDATED", "REJECTED"];
  return pipeline === "pathology-nuclei" || pipeline === "cardio-seg-mri" ? ["VALIDATED", "REJECTED"] : aiRunDecisions;
}

export const DECISION_REASON_MIN_LENGTH = 5;
export const DECISION_REASON_MAX_LENGTH = 500;

/** Explicit text and status colour; never the specialty colour. */
export const decisionTones: Record<AiRunDecision, DashboardStatusTone> = {
  VALIDATED: "success",
  CORRECTED: "warning",
  REJECTED: "danger",
};

type ModelAnswerFields = Pick<AiAnalysisRun, "modelDecision" | "modelLabel" | "pipeline" | "predictions"> &
  Partial<Pick<AiAnalysisRun, "modelLabels">>;
type DecisionFields = ModelAnswerFields &
  Pick<AiAnalysisRun, "decisionLabel" | "decisionStatus"> &
  Partial<Pick<AiAnalysisRun, "decisionLabels">>;

/**
 * The model's answer the physician decides on (backend getModelLabel): the
 * brain classifier's top class, the BreakHis result; none for a nuclei map.
 */
export function getModelLabel(run: ModelAnswerFields): string | null {
  if (run.modelLabel) return run.modelLabel;
  switch (run.pipeline) {
    case "brain":
      return getTopLabel(run.predictions);
    case "pathology-breast":
      return run.modelDecision;
    default:
      return null;
  }
}

/** ECG: the model's positive classes (backend getModelLabels); null for the other chains. */
export function getModelLabels(run: ModelAnswerFields): EcgClass[] | null {
  if (run.pipeline !== "cardio-ecg") return null;
  if (run.modelLabels) return sortEcgLabels(run.modelLabels);
  const stored = run.predictions;
  return stored && !Array.isArray(stored) && "positive" in stored
    ? sortEcgLabels(stored.positive)
    : null;
}

/** notApplicable: a nuclei map, which has no class to agree with. */
export type DecisionAgreement = "pending" | "agrees" | "disagrees" | "rejected" | "notApplicable";

/** Whether the physician retained the model's answer. */
export function getDecisionAgreement(run: DecisionFields): DecisionAgreement {
  if (run.decisionStatus === null) return "pending";
  if (run.decisionStatus === "REJECTED") return "rejected";
  if (run.pipeline === "cardio-ecg") {
    const modelLabels = getModelLabels(run);
    if (!modelLabels || !run.decisionLabels) return "notApplicable";
    return sameLabels(run.decisionLabels, modelLabels) ? "agrees" : "disagrees";
  }
  // The measures of a cine have no label: the physician kept them as they were, or changed them.
  if (run.pipeline === "cardio-volume-mri") return run.decisionStatus === "VALIDATED" ? "agrees" : "disagrees";
  const modelLabel = getModelLabel(run);
  if (modelLabel === null) return "notApplicable";
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
  const modelLabel = getModelLabel(run);
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

/** Corrections offered: the chain's labels except the model's answer. */
export function getCorrectionOptions(pipeline: AiPipelineId, modelLabel: string | null): AiOutputClassKey[] {
  return correctionLabels[pipeline].filter((label) => label !== modelLabel);
}

/** As the backend stores it: trimmed, inner whitespace collapsed. */
export function normalizeDecisionReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

export type DecisionDraft = {
  status: AiRunDecision | null;
  correctedLabel: string;
  /** ECG only: the classes kept by a correction. */
  correctedLabels?: EcgClass[];
  reason: string;
};

export type DecisionDraftErrors = {
  status?: "required";
  correctedLabel?: "required" | "matchesModel";
  correctedLabels?: "required" | "matchesModel" | "normExclusive";
  reason?: "required" | "tooShort" | "tooLong";
};

/** Same rules as the backend; an empty object means the draft can be sent. */
export function validateDecisionDraft(
  draft: DecisionDraft,
  modelLabel: string | null,
  pipeline: AiPipelineId,
  /** ECG: the model's positive classes. */
  modelLabels: readonly EcgClass[] | null = null,
  /** A cine: whether the physician changed the measures (a correction then, a validation otherwise). */
  volumetryModified = false,
): DecisionDraftErrors {
  if (draft.status === null || !getDecisionOptions(pipeline, volumetryModified).includes(draft.status)) {
    return { status: "required" };
  }
  if (draft.status === "VALIDATED") return {};

  const errors: DecisionDraftErrors = {};
  if (draft.status === "CORRECTED" && pipeline === "cardio-volume-mri") {
    // Nothing to name: the measures are the ones saved before the decision. Only the reason.
  } else if (draft.status === "CORRECTED" && pipeline === "cardio-ecg") {
    const labels = sortEcgLabels(draft.correctedLabels ?? []);
    if (labels.length === 0) errors.correctedLabels = "required";
    else if (labels.includes(ECG_NORMAL_CLASS) && labels.length > 1) errors.correctedLabels = "normExclusive";
    else if (modelLabels && sameLabels(labels, modelLabels)) errors.correctedLabels = "matchesModel";
  } else if (draft.status === "CORRECTED") {
    if (!(correctionLabels[pipeline] as readonly string[]).includes(draft.correctedLabel)) errors.correctedLabel = "required";
    else if (draft.correctedLabel === modelLabel) errors.correctedLabel = "matchesModel";
  }

  const length = normalizeDecisionReason(draft.reason).length;
  if (length === 0) errors.reason = "required";
  else if (length < DECISION_REASON_MIN_LENGTH) errors.reason = "tooShort";
  else if (length > DECISION_REASON_MAX_LENGTH) errors.reason = "tooLong";

  return errors;
}

/** The body of POST .../decision: a validation carries no reason nor class. */
export function toDecisionPayload(
  draft: DecisionDraft & { status: AiRunDecision },
  pipeline: AiPipelineId | null = null,
): DecideAiAnalysisRunPayload {
  switch (draft.status) {
    case "VALIDATED":
      return { status: "VALIDATED" };
    case "CORRECTED":
      if (pipeline === "cardio-volume-mri") {
        return { measuresCorrected: true, reason: normalizeDecisionReason(draft.reason), status: "CORRECTED" };
      }
      return pipeline === "cardio-ecg"
        ? {
            correctedLabels: sortEcgLabels(draft.correctedLabels ?? []),
            reason: normalizeDecisionReason(draft.reason),
            status: "CORRECTED",
          }
        : { correctedLabel: draft.correctedLabel, reason: normalizeDecisionReason(draft.reason), status: "CORRECTED" };
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
  "AI_CORRECTED_LABEL_INVALID",
  "AI_CORRECTION_NOT_APPLICABLE",
  "AI_CORRECTED_LABELS_REQUIRED",
  "AI_CORRECTED_LABELS_INVALID",
  "AI_CORRECTED_LABELS_NOT_APPLICABLE",
  "AI_VOLUMETRY_MODIFIED",
  "AI_MEASURES_CORRECTED_UNEXPECTED",
  "AI_MEASURES_CORRECTED_NOT_APPLICABLE",
] as const;
const KNOWN_DECISION_ERRORS = new Set<string>(knownDecisionErrorCodes);

/** Key under aiAnalyses.decision.errors for a failed decision. */
export function getDecisionErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "unknown";
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && KNOWN_DECISION_ERRORS.has(code) ? code : "unknown";
}

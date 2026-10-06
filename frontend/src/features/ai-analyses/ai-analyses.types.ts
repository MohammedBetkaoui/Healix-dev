import { type aiAnalysesFr } from "@/i18n/locales/fr/ai-analyses";

// ---------------------------------------------------------------------------
// Model registry (ai-models.registry.ts)
// ---------------------------------------------------------------------------

export const aiModules = ["brain", "cardiology", "pathology"] as const;
export type AiModule = (typeof aiModules)[number];

export const aiModelTasks = ["classification", "segmentation"] as const;
export type AiModelTask = (typeof aiModelTasks)[number];

export const aiModelStatuses = ["available", "in_design", "exploring"] as const;
export type AiModelStatus = (typeof aiModelStatuses)[number];

// Label vocabularies are the keys of the fr dictionary (the reference one):
// the registry cannot name a label that does not exist, and
// dictionaries.test.ts keeps ar in step.
type AiAnalysesCopy = typeof aiAnalysesFr;
export type AiModalityKey = keyof AiAnalysesCopy["modalities"];
export type AiOutputClassKey = keyof AiAnalysesCopy["classes"];
export type AiMetricKey = keyof AiAnalysesCopy["metrics"];
export type AiLimitationKey = keyof AiAnalysesCopy["limitations"];

export type AiModelMetric = {
  key: AiMetricKey;
  /** As communicated by the model team; a fraction for a percentage (0.9927 = 99.27 %). */
  value: number;
  unit: "percent" | "score";
  /** Given as "≈" by the source. */
  approximate: boolean;
  /** Evaluation dataset; null when not provided. */
  dataset: string | null;
};

/**
 * One model of the catalog. Every fact comes from the model team: a fact that
 * was not provided stays null (shown as "non renseigné"), never a plausible
 * value. Name and intended use are translated under aiAnalyses.models.<id>.
 */
export type AiModel = {
  id: string;
  module: AiModule;
  version: string | null;
  architecture: string | null;
  task: AiModelTask;
  inputModality: AiModalityKey | null;
  /** File formats accepted as input; null when not provided. */
  acceptedFormats: readonly string[] | null;
  /** Classification classes, or the structures a segmentation delimits; empty when not provided. */
  outputClasses: readonly AiOutputClassKey[];
  /** Internal validation metrics, the first one being the main one; null when none was provided. */
  metrics: readonly AiModelMetric[] | null;
  trainingData: string | null;
  knownLimitations: readonly AiLimitationKey[];
  /** Not documented for any model yet: shown as "non renseigné". */
  underrepresentedPopulations: null;
  status: AiModelStatus;
};

// ---------------------------------------------------------------------------
// Analysis run
// ---------------------------------------------------------------------------
// Contract only: no inference service exists yet. The backend will serve
// these runs later (per patient, like GET /patients/:id/ai-analyses); until
// then nothing in the frontend may build one, so no result is ever simulated.

export type AiAnalysisRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected_input";

/** Input check run before inference; the reason of a "rejected_input" run. Shape to confirm with the backend. */
export type AiInputQualityCheck = {
  passed: boolean;
  /** Machine-readable reasons (e.g. "unsupported_modality"), translated on display. */
  issues: readonly string[];
};

export type AiPrediction = {
  /** Raw output label of the model (an outputClasses key of its registry entry). */
  label: string;
  /** 0 to 1. */
  probability: number;
};

export type AiSegmentationResult = {
  maskUrl: string;
  areaPx: number;
  /** Share of the image covered by the mask, 0 to 1. */
  areaRatio: number;
};

export type AiClinicianDecision = {
  status: "validated" | "corrected" | "rejected";
  reason?: string;
  /** ISO date. */
  decidedAt: string;
};

export type AiAnalysisRun = {
  id: string;
  patientId: string;
  /** Id of an ai-models.registry entry. */
  modelId: string;
  modelVersion: string;
  /** Patient document the analysis ran on. */
  sourceDocumentId: string;
  status: AiAnalysisRunStatus;
  /** null until the check has run (queued). */
  qualityCheck: AiInputQualityCheck | null;
  /** Empty unless the run succeeded. */
  predictions: readonly AiPrediction[];
  segmentation?: AiSegmentationResult;
  clinicianImpression?: string;
  decision?: AiClinicianDecision;
  /** null while queued or running. */
  durationMs: number | null;
  /** ISO date. */
  createdAt: string;
};

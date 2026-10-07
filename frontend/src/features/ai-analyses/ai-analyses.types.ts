import { type aiAnalysesFr } from "@/i18n/locales/fr/ai-analyses";

// ---------------------------------------------------------------------------
// Model registry (ai-models.registry.ts)
// ---------------------------------------------------------------------------

export const aiModules = ["brain", "cardiology", "pathology"] as const;
export type AiModule = (typeof aiModules)[number];

export const aiModelTasks = ["classification", "segmentation"] as const;
export type AiModelTask = (typeof aiModelTasks)[number];

// requires_multisequence and documentation_pending are not launchable: the
// card explains why (aiAnalyses.statusNotes).
export const aiModelStatuses = [
  "available",
  "in_design",
  "exploring",
  "requires_multisequence",
  "documentation_pending",
] as const;
export type AiModelStatus = (typeof aiModelStatuses)[number];

// Label vocabularies are the keys of the fr dictionary (the reference one):
// the registry cannot name a label that does not exist, and
// dictionaries.test.ts keeps ar in step.
type AiAnalysesCopy = typeof aiAnalysesFr;
export type AiModalityKey = keyof AiAnalysesCopy["modalities"];
export type AiOutputClassKey = keyof AiAnalysesCopy["classes"];
export type AiMetricKey = keyof AiAnalysesCopy["metrics"];
export type AiLimitationKey = keyof AiAnalysesCopy["limitations"];
export type AiDatasetKey = keyof AiAnalysesCopy["datasets"];

export type AiModelMetric = {
  key: AiMetricKey;
  /** As read in the training notebooks; a fraction for a percentage (0.9544 = 95.44 %). */
  value: number;
  unit: "percent" | "score";
  /** Given as "≈" by the source. */
  approximate: boolean;
  /** Evaluation dataset (aiAnalyses.datasets); null when not provided. */
  dataset: AiDatasetKey | null;
};

/** Per-class precision and recall of a classifier, on its test set. */
export type AiClassMetric = {
  classKey: AiOutputClassKey;
  precision: number;
  recall: number;
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
  /**
   * File formats accepted as input, as lowercase extensions without the dot
   * ("png", "jpeg", "dcm"; "jpg" and "jpeg" are equivalent). null when not
   * provided: the quality check then shows "non renseigné" and does not block.
   */
  acceptedFormats: readonly string[] | null;
  /** Classification classes, or the structures a segmentation delimits; empty when not provided. */
  outputClasses: readonly AiOutputClassKey[];
  /** Internal evaluation metrics, the first one being the main one; null when none was provided. */
  metrics: readonly AiModelMetric[] | null;
  /** Classifiers only; null when not provided. */
  classMetrics: readonly AiClassMetric[] | null;
  /** Evaluation dataset of classMetrics. */
  classMetricsDataset: AiDatasetKey | null;
  trainingData: string | null;
  knownLimitations: readonly AiLimitationKey[];
  /** Not documented for any model yet: shown as "non renseigné". */
  underrepresentedPopulations: null;
  status: AiModelStatus;
};

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const aiPipelineIds = ["brain"] as const;
export type AiPipelineId = (typeof aiPipelineIds)[number];

/**
 * A launchable chain of registry models: the classifier always runs, then the
 * segmenter routed by the predicted class, if any. Segmenters are never
 * launched on their own (evaluated only on images with their tumour type).
 */
export type AiPipeline = {
  id: AiPipelineId;
  module: AiModule;
  classifierId: string;
  segmenterByClass: Partial<Record<AiOutputClassKey, string>>;
};

// ---------------------------------------------------------------------------
// Analysis run (GET/POST /patients/:id/ai-analysis-runs)
// ---------------------------------------------------------------------------
// Mirrors backend/src/ai-analysis-runs/ai-analysis-runs.service.ts#toRunResponse.

export type AiAnalysisRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED_INPUT";

export type AiRunPrediction = {
  /** A classifier output class (glioma, meningioma, notumor, pituitary). */
  label: string;
  /** 0 to 1. */
  probability: number;
};

export type AiAnalysisRun = {
  id: string;
  patientId: string;
  sourceDocumentId: string;
  pipeline: AiPipelineId;
  status: AiAnalysisRunStatus;
  classificationModelId: string | null;
  classificationWeightsSha256: string | null;
  /** Descending, as returned by the service; null unless SUCCEEDED. */
  predictions: AiRunPrediction[] | null;
  segmentationModelId: string | null;
  segmentationWeightsSha256: string | null;
  hasMask: boolean;
  maskAreaPx: number | null;
  /** Share of the image covered by the mask, 0 to 1. */
  maskAreaRatio: number | null;
  segmentationSkippedReason: "not_applicable_for_class" | "model_not_loaded" | null;
  clinicianImpression: string | null;
  /** SERVICE_UNAVAILABLE, SERVICE_TIMEOUT, MODEL_NOT_LOADED, INVALID_IMAGE… */
  errorCode: string | null;
  durationMs: number | null;
  requestedById: string;
  createdAt: string;
  updatedAt: string;
};

/** GET /ai-models/status: the inference service as seen by the backend. */
export type AiServiceStatus = {
  service: "available" | "unavailable" | "not_configured" | "unauthorized" | "error";
  models: { modelId: string; loaded: boolean; weightsSha256: string | null; error: string | null }[];
};

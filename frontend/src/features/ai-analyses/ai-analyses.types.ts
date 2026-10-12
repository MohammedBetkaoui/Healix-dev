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

/** 95 % interval [lower, upper], in the unit of its value. */
export type AiInterval = readonly [number, number];

export type AiModelMetric = {
  key: AiMetricKey;
  /** A fraction for a percentage (0.955 = 95.5 %). */
  value: number;
  unit: "percent" | "score";
  /** Given as "≈" by the source. */
  approximate: boolean;
  /** Evaluation dataset (aiAnalyses.datasets); null when not provided. */
  dataset: AiDatasetKey | null;
  /** Bootstrap 95 % interval; null when the source gives none. */
  ci95: AiInterval | null;
  /**
   * "evaluation": measured on the service itself (brain-evaluation.ts, from
   * ai-service/scripts/evaluate_brain.py); "notebook": read in a training notebook.
   */
  source: "evaluation" | "notebook";
};

/** Per-class metrics of a classifier, on its test set. */
export type AiClassMetric = {
  classKey: AiOutputClassKey;
  precision: number;
  recall: number;
  recallCi95: AiInterval | null;
  f1: number | null;
  /** One-vs-rest. */
  auc: number | null;
};

/** Counts on the test set: rows are the true classes, columns the predicted ones, in `labels` order. */
export type AiConfusionMatrix = {
  labels: readonly AiOutputClassKey[];
  matrix: readonly (readonly number[])[];
};

/**
 * Image sizes a model accepts, in pixels per side, as its service enforces
 * them (ai-service: 422 image_too_small / image_dimensions_too_large).
 */
export type AiInputConstraints = { minSide: number; maxSide: number };

/** The service evaluation report a model's metrics come from. */
export type AiModelEvaluation = {
  /** File name in ai-service/evaluation/. */
  report: string;
  /** YYYY-MM-DD */
  date: string;
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
  /** Sizes checked before launching; null when the model gives none. */
  inputConstraints: AiInputConstraints | null;
  /** Internal evaluation metrics, the first one being the main one; null when none was provided. */
  metrics: readonly AiModelMetric[] | null;
  /** Classifiers only; null when not provided. */
  classMetrics: readonly AiClassMetric[] | null;
  /** Evaluation dataset of classMetrics. */
  classMetricsDataset: AiDatasetKey | null;
  /** Classifiers measured by the service evaluation; null otherwise. */
  confusionMatrix: AiConfusionMatrix | null;
  /** Where the "evaluation" metrics come from; null when no metric does. */
  evaluation: AiModelEvaluation | null;
  trainingData: string | null;
  knownLimitations: readonly AiLimitationKey[];
  /** Not documented for any model yet: shown as "non renseigné". */
  underrepresentedPopulations: null;
  status: AiModelStatus;
};

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const aiPipelineIds = ["brain", "pathology-breast", "pathology-nuclei"] as const;
export type AiPipelineId = (typeof aiPipelineIds)[number];

/**
 * A launchable chain of registry models, never run one after another:
 * - "routed": the entry model (a classifier) always runs, then the segmenter
 *   routed by its predicted class, if any. Segmenters are never launched on
 *   their own (evaluated only on images with their tumour type).
 * - "single": the entry model alone.
 */
export type AiPipeline = {
  id: AiPipelineId;
  module: AiModule;
  kind: "routed" | "single";
  entryModelId: string;
  segmenterByClass: Partial<Record<AiOutputClassKey, string>>;
};

/** Microscope magnification of a histopathology slide. */
export const aiMagnifications = [40, 100, 200, 400] as const;
export type AiMagnification = (typeof aiMagnifications)[number];

/** The nuclei segmentation's types, in its output order (background excluded). */
export const nucleusTypes = ["neoplastic", "inflammatory", "connective", "dead", "epithelial"] as const;
export type NucleusType = (typeof nucleusTypes)[number];

export type AiNucleiFractions = {
  /** Share of all the pixels, 0 to 1. */
  background: number;
  /** Share of the nucleus pixels per type, 0 to 1; every type null without any nucleus. */
  nucleusTypes: Record<NucleusType, number | null>;
};

// ---------------------------------------------------------------------------
// Analysis run (GET/POST /patients/:id/ai-analysis-runs)
// ---------------------------------------------------------------------------
// Mirrors backend/src/ai-analysis-runs/ai-analysis-runs.service.ts#toRunResponse.

export type AiAnalysisRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED_INPUT";

/** The physician's final decision on a SUCCEEDED run (one per run). */
export const aiRunDecisions = ["VALIDATED", "CORRECTED", "REJECTED"] as const;
export type AiRunDecision = (typeof aiRunDecisions)[number];

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
  /** Brain only: descending, as returned by the service; null unless SUCCEEDED. */
  predictions: AiRunPrediction[] | null;
  /** The model's answer the physician decides on: the brain top class, the BreakHis result; null for a nuclei map. */
  modelLabel: string | null;
  /** Pathology: slide magnification (40 for the nuclei segmentation). */
  magnification: number | null;
  /** BreakHis: mean of the 4 view scores, 0 to 1. A score, never a probability. */
  malignancyScore: number | null;
  /** BreakHis: the threshold the score was compared with. */
  decisionThreshold: number | null;
  /** BreakHis: original, left-right flip, up-down flip, both. */
  ttaScores: number[] | null;
  /** BreakHis result: "benign" or "malignant". */
  modelDecision: string | null;
  /** PanNuke: pixel shares. */
  nucleiFractions: AiNucleiFractions | null;
  /** PanNuke: tiles of 256 x 256 the image was cut into. */
  tileCount: number | null;
  /** PanNuke: a colour overlay is served by GET .../overlay. */
  hasOverlay: boolean;
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
  /** null until the physician decides; final once set. */
  decisionStatus: AiRunDecision | null;
  /** The label the physician retained: the model's answer (VALIDATED), the corrected one (CORRECTED); null when REJECTED, and for a validated nuclei map. */
  decisionLabel: string | null;
  decisionReason: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  /** Number of its PDF report (CR-IA-<year>-<NNNNNN>), once generated. */
  reportNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Follow-up across the workspace (GET /ai-analysis-runs[/summary])
// ---------------------------------------------------------------------------
// Mirrors backend/src/ai-analysis-runs/overview.

/** "pending": SUCCEEDED and not decided yet. */
export type AiRunDecisionFilter = "pending" | AiRunDecision;

/** Of the patient, the list carries only its id and names. */
export type AiRunPatientName = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string;
  lastNameAr: string;
};

export type AiRunListItem = AiAnalysisRun & { patient: AiRunPatientName };

export type AiRunsPage = {
  items: AiRunListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/** A rate always comes with its counts; null under the minimum of decisions. */
export type AiRunsRate = {
  count: number;
  total: number;
  rate: number | null;
  insufficientData: boolean;
};

export type AiRunsSummary = {
  period: { from: string | null; to: string | null };
  analyses: number;
  byStatus: Record<AiAnalysisRunStatus, number>;
  pending: { count: number; oldestCreatedAt: string | null; oldestAgeHours: number | null };
  decisions: Record<AiRunDecision, number> & { total: number };
  minimumDecisions: number;
  /** Fewer validated + corrected runs than minimumDecisions: no rate is shown. */
  insufficientData: boolean;
  /** Brain runs only: VALIDATED / (VALIDATED + CORRECTED). */
  agreement: AiRunsRate;
  /** Model's top class (rows) x class kept by the physician (columns). */
  matrix: { modelLabels: string[]; retainedLabels: string[]; counts: number[][] };
  uncertainty: {
    threshold: number;
    belowThreshold: AiRunsRate;
    agreementAbove: AiRunsRate;
    agreementBelow: AiRunsRate;
  };
};

/** GET /ai-models/status: the inference service as seen by the backend. */
export type AiServiceStatus = {
  service: "available" | "unavailable" | "not_configured" | "unauthorized" | "error";
  models: { modelId: string; loaded: boolean; weightsSha256: string | null; error: string | null }[];
};

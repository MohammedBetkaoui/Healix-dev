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
export type AiStatusNoteKey = keyof AiAnalysesCopy["statusNotes"];

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
  /** Optional, model-specific explanation shown when there is no launch path. */
  statusNote?: AiStatusNoteKey;
};

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const aiPipelineIds = [
  "brain",
  "pathology-breast",
  "pathology-nuclei",
  "cardio-ecg",
  "cardio-seg-mri",
  "cardio-volume-mri",
] as const;
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
  /**
   * Where the chain starts from. By default the analysis wizard (a document of the record);
   * "dicom-study": a series of a DICOM study ("Mesurer le coeur"), which the wizard cannot take.
   */
  launch?: "dicom-study";
};

/** Microscope magnification of a histopathology slide. */
export const aiMagnifications = [40, 100, 200, 400] as const;
export type AiMagnification = (typeof aiMagnifications)[number];

/** The nuclei segmentation's types, in its output order (background excluded). */
export const nucleusTypes = ["neoplastic", "inflammatory", "connective", "dead", "epithelial"] as const;
export type NucleusType = (typeof nucleusTypes)[number];

/** The 5 superclasses of PTB-XL the ECG model gives, in its output order (multi-label). */
export const ecgClasses = ["NORM", "MI", "STTC", "CD", "HYP"] as const;
export type EcgClass = (typeof ecgClasses)[number];

/** The 12 leads, in the model card's order. */
export const ecgLeads = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
export type EcgLead = (typeof ecgLeads)[number];

/** Sampling rates offered for a CSV signal; any integer from 100 to 1000 Hz is accepted. */
export const ecgSamplingRatePresets = [100, 250, 500, 1000] as const;
export const ECG_MIN_SAMPLING_RATE = 100;
export const ECG_MAX_SAMPLING_RATE = 1000;
export const ecgUnits = ["mV", "uV"] as const;
export type EcgUnit = (typeof ecgUnits)[number];

/** What a cardio-ecg run stores in `predictions` (backend EcgPredictions). */
export type AiEcgPredictions = {
  /** Sigmoid per class, averaged over the windows: independent, they do not sum to 1. */
  probabilities: Record<EcgClass, number>;
  thresholds: Record<EcgClass, number>;
  /** Classes at or above their threshold, by decreasing probability. */
  positive: EcgClass[];
  windows: number;
  inputSamplingRate: number;
  durationSeconds: number;
  /** SHA-256 of the model card. */
  configSha256: string;
};

/** GET .../ecg-trace: the first 10 s, band-pass filtered, not normalized. */
export type AiEcgTrace = {
  samplingRate: number;
  unit: "mV";
  leads: Record<EcgLead, number[]>;
};

/** GET /ai-models/cardio-ecg/evaluation/:sha: the figures of these weights. */
export type CardioEvaluation = {
  /** service: measured on the service itself; notebook: the training notebook's, from the model card. */
  source: "service" | "notebook";
  file: string;
  generatedAt: string | null;
  weightsSha256: string;
  nEcg: number;
  aucMacro: number;
  perClass: Record<
    EcgClass,
    {
      auc: number;
      threshold: number;
      sensitivity: number | null;
      specificity: number | null;
      ppv: number | null;
      f1: number | null;
    }
  >;
};

export type AiNucleiFractions = {
  /** Share of all the pixels, 0 to 1. */
  background: number;
  /** Share of the nucleus pixels per type, 0 to 1; every type null without any nucleus. */
  nucleusTypes: Record<NucleusType, number | null>;
};

/** Structures of the ACDC model, in class-index order 1, 2, 3. */
export const cardioSegStructures = ["LV", "RV", "MYO"] as const;
export type CardioSegStructure = (typeof cardioSegStructures)[number];

export type CardioSegArea = { pixels: number; areaMm2: number | null };

/** What a cardio-seg-mri run stores in `predictions`. */
export type AiCardioSegPredictions = {
  configSha256: string;
  noStructureFound: boolean;
  pixelSpacingMm: [number, number] | null;
  source: "image" | "dicom";
  structures: Record<CardioSegStructure, CardioSegArea>;
};

/** What a cardio-volume-mri run stores in `predictions`: the model card; the rest is in `volumetry`. */
export type AiCardioVolumePredictions = { configSha256: string };

// ---------------------------------------------------------------------------
// Cardiac cine volumetry (backend/src/ai-analysis-runs/volumetry)
// ---------------------------------------------------------------------------

/** The LV ejection fraction classes of the 2021 ESC heart failure guidelines. */
export const lvefClasses = ["reduced", "mildlyReduced", "preserved"] as const;
export type LvefClass = (typeof lvefClasses)[number];

export type VolumetryVentricle = {
  edvMl: number;
  esvMl: number;
  svMl: number;
  /** Percent; null when the end-diastolic volume is nil. */
  efPercent: number | null;
};

export type VolumetryIndexed = {
  lvEdvMlM2: number;
  lvEsvMlM2: number;
  lvSvMlM2: number;
  rvEdvMlM2: number;
  rvEsvMlM2: number;
  lvMassGM2: number;
  cardiacIndexLMinM2: number | null;
};

/** Nothing is rounded: rounding is for display. Phases and slices are counted from 0. */
export type AiVolumetryMeasures = {
  edPhase: number;
  esPhase: number;
  excludedSlices: number[];
  lv: VolumetryVentricle;
  rv: VolumetryVentricle;
  lvMassG: number;
  /** Only with a heart rate. */
  cardiacOutputLMin: number | null;
  heartRateBpm: number | null;
  bsaM2: number | null;
  /** Only with a body surface area. */
  indexed: VolumetryIndexed | null;
  lvefClass: LvefClass | null;
  warnings: string[];
};

/** The areas of one slice, mm². */
export type AiVolumetrySliceAreas = Record<CardioSegStructure, number>;

/** What the service noticed without refusing: a code and short details. */
export type AiVolumetryWarning = { code: string } & Record<string, number | string>;

export type AiVolumetryBsaSource = "dicom" | "manual";

/**
 * GET .../ai-analysis-runs: the volumetry as the backend shows it (volumetryResponse):
 * the model's proposal, the physician's version, what is in force, and the areas of
 * the ED and ES in force only (the areas of every phase stay on the server).
 */
export type AiVolumetry = {
  version: number;
  phases: number;
  /** From the base (0) toward the apex. */
  slices: { positionMm: number; stepMm: number | null }[];
  /** The step between slices the volumes use, mm. */
  sliceGapMm: number;
  sliceOrderInferred: boolean;
  phaseTimesMs: number[] | null;
  /** (row, column) in mm. */
  pixelSpacingMm: [number, number];
  /** From the DICOM height and weight; null without them. */
  bsaM2: number | null;
  heartRateBpm: number | null;
  warnings: AiVolumetryWarning[];
  /** The phases whose images are stored: the model's ED and ES, one image per slice. */
  images: { edPhase: number; esPhase: number; slices: number };
  /** What the model proposed. */
  auto: {
    edPhase: number;
    esPhase: number;
    lvVolumeCurveMl: number[];
    measures: AiVolumetryMeasures;
  };
  /** What the physician made of it; null as long as they changed nothing. */
  corrected: {
    bsaM2: number | null;
    bsaSource: AiVolumetryBsaSource | null;
    correctedAt: string;
    edPhase: number;
    esPhase: number;
    excludedSlices: number[];
    lvVolumeCurveMl: number[];
    measures: AiVolumetryMeasures;
  } | null;
  /** What is in force: the physician's version when there is one, else the model's. */
  effective: {
    bsaM2: number | null;
    bsaSource: AiVolumetryBsaSource | null;
    edPhase: number;
    esPhase: number;
    excludedSlices: number[];
    lvVolumeCurveMl: number[];
    measures: AiVolumetryMeasures;
  };
  /** The areas [slice] of the ED and ES in force. */
  areas: { ed: AiVolumetrySliceAreas[]; es: AiVolumetrySliceAreas[] };
  /** ED, ES or the slices counted differ from the model's (a height and a weight alone are not a modification). */
  modified: boolean;
};

/** GET /ai-models/cardio-volume/evaluation/:sha: the ejection fractions against the ACDC truth. */
export type AiAgreementFigures = {
  n: number;
  /** Mean absolute error, in points of ejection fraction. */
  mae: number;
  bias: number;
  /** Bias +/- 1.96 SD of the differences. */
  limitsOfAgreement: [number, number] | null;
  pearsonR: number | null;
};

export type CardioVolumeEvaluation = {
  source: "service";
  file: string;
  generatedAt: string;
  weightsSha256: string;
  nPatients: number;
  lvef: AiAgreementFigures;
  rvef: AiAgreementFigures;
};

/** GET /ai-models/cardio-seg/evaluation/:sha. */
export type CardioSegEvaluation = {
  source: "service" | "notebook";
  file: string;
  generatedAt: string | null;
  weightsSha256: string;
  nVolumes: number;
  testPatients: number;
  meanDice: number;
  perClass: Record<CardioSegStructure, { mean: number; std: number | null }>;
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
  /** Brain: descending, as returned by the service; ECG: probabilities, thresholds, positive classes; null unless SUCCEEDED. */
  predictions: AiRunPrediction[] | AiEcgPredictions | AiCardioSegPredictions | AiCardioVolumePredictions | null;
  /** The model's answer the physician decides on: the brain top class, the BreakHis result; null for a nuclei map and an ECG. */
  modelLabel: string | null;
  /** ECG: the model's positive classes (possibly none), in class order; null for the other chains. */
  modelLabels: EcgClass[] | null;
  /** ECG: the trace is served by GET .../ecg-trace. */
  hasTrace: boolean;
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
  /** Cardiac MRI: the analysed 8-bit slice is served by GET .../slice. */
  hasSlice: boolean;
  /** Cardiac cine: the measures, the curve and what the physician changed; null for the other chains. */
  volumetry?: AiVolumetry | null;
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
  /** ECG: the classes the physician kept (possibly none); null otherwise and when REJECTED. */
  decisionLabels: EcgClass[] | null;
  decisionReason: string | null;
  decidedById: string | null;
  /** As shown: "Dr <name>" for a physician (formatPhysicianName, backend), the name as typed for anyone else. */
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

/** The reading priority of a run (backend/src/ai-analysis-runs/priority): an order of reading, not a diagnosis. */
export const aiPriorityLevels = ["URGENT", "HIGH", "ROUTINE"] as const;
export type AiPriorityLevel = (typeof aiPriorityLevels)[number];

export type AiPriorityReasonCode =
  | "ALREADY_DECIDED"
  | "BRAIN_GLIOMA"
  | "BRAIN_TUMOR_POSSIBLE"
  | "BRAIN_TUMOR_PREDICTED"
  | "BREAST_ABOVE_THRESHOLD"
  | "BREAST_BORDERLINE"
  | "BREAST_MALIGNANT"
  | "CARDIO_NO_STRUCTURE"
  | "CARDIO_STRUCTURE_ABSENT"
  | "ECG_MI"
  | "ECG_MULTIPLE_ABNORMAL"
  | "LOW_CONFIDENCE"
  | "NO_RESULT"
  | "NUCLEI_NONE_FOUND"
  | "VOLUME_ES_EXCEEDS_ED"
  | "VOLUME_LVEF_MILDLY_REDUCED"
  | "VOLUME_LVEF_REDUCED"
  | "VOLUME_NOT_MEASURABLE";

export type AiPriorityReason = {
  code: AiPriorityReasonCode;
  /** Probabilities and scores as stored (0 to 1), counts, structure names. */
  params?: Record<string, number | string>;
};

export type AiPriority = {
  level: AiPriorityLevel;
  /** 0 to 100; ROUTINE under 40, HIGH 40-69, URGENT from 70. */
  score: number;
  reasons: AiPriorityReason[];
};

export type AiRunListItem = AiAnalysisRun & { patient: AiRunPatientName; priority: AiPriority };

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

import {
  ecgClasses,
  type AiDatasetKey,
  type AiModel,
  type AiModelMetric,
  type AiPipeline,
  type AiPipelineId,
} from "./ai-analyses.types";
import {
  brainClassificationEvaluation,
  brainClassLabels,
  brainEvaluationSource,
  brainSegmentationEvaluation,
  type BrainSegmentationEvaluation,
} from "./brain-evaluation";
import { cardioNotebookEvaluation } from "./cardio-evaluation";
import {
  breakhisEvaluation,
  pannukeEvaluation,
  pannukeEvaluationSource,
  pannukeNotebookValidation,
  pathologyEvaluationSource,
} from "./pathology-evaluation";

// Single source of truth of the AI models shown in HealixDZ. The metrics of
// the deployed models are measured on the service itself (brain-evaluation.ts,
// pathology-evaluation.ts: source "evaluation"); the few other figures are
// read from the training notebooks (source "notebook"); the other facts come
// from the model team. Only what was provided is filled in: every other fact
// stays null and the UI shows "non renseigné". No metric may be added without
// its source (see ai-models.registry.test.ts).
// Names and intended uses are translated under aiAnalyses.models.<id>.

const classification = brainClassificationEvaluation;
const { meningioma, pituitary } = brainSegmentationEvaluation;
const serviceEvaluation = { date: brainEvaluationSource.date, report: brainEvaluationSource.report };
const pathologyServiceEvaluation = { date: pathologyEvaluationSource.date, report: pathologyEvaluationSource.report };
const pannukeServiceEvaluation = { date: pannukeEvaluationSource.date, report: pannukeEvaluationSource.report };

// BreakHis at the service's threshold, with 4 views, on the test patients:
// intervals from resampling the patients.
const breakhisMeasured = { approximate: false, dataset: "breakhisTest", source: "evaluation" } as const;
const breakhisMetrics = [
  { key: "breakhisAccuracy", value: breakhisEvaluation.accuracy.value, ci95: breakhisEvaluation.accuracy.ci95, unit: "percent", ...breakhisMeasured },
  { key: "breakhisSensitivity", value: breakhisEvaluation.sensitivity.value, ci95: breakhisEvaluation.sensitivity.ci95, unit: "percent", ...breakhisMeasured },
  { key: "breakhisSpecificity", value: breakhisEvaluation.specificity.value, ci95: breakhisEvaluation.specificity.ci95, unit: "percent", ...breakhisMeasured },
  { key: "breakhisPrecision", value: breakhisEvaluation.precision.value, ci95: breakhisEvaluation.precision.ci95, unit: "percent", ...breakhisMeasured },
  { key: "breakhisAucRoc", value: breakhisEvaluation.aucRoc.value, ci95: breakhisEvaluation.aucRoc.ci95, unit: "score", ...breakhisMeasured },
] as const satisfies readonly AiModelMetric[];

// Mean Dice with its interval first (the main metric); median, sensitivity
// and IoU in the model sheet.
function segmentationMetrics(evaluation: BrainSegmentationEvaluation, dataset: AiDatasetKey) {
  const measured = { approximate: false, dataset, source: "evaluation" } as const;
  return [
    { key: "testDice", value: evaluation.dice.mean, ci95: evaluation.dice.ci95, unit: "score", ...measured },
    { key: "testDiceMedian", value: evaluation.dice.median, ci95: null, unit: "score", ...measured },
    { key: "testSensitivity", value: evaluation.sensitivity.mean, ci95: evaluation.sensitivity.ci95, unit: "percent", ...measured },
    { key: "testIou", value: evaluation.iou.mean, ci95: evaluation.iou.ci95, unit: "score", ...measured },
  ] as const satisfies readonly AiModelMetric[];
}

/** Test images behind a dataset label ("… ({count} images)"); absent when unknown. */
export const datasetSizes: Partial<Record<AiDatasetKey, number>> = {
  brainClassificationTest: classification.testImages,
  meningiomaTest: meningioma.testImages,
  pituitaryTest: pituitary.testImages,
  breakhisTest: breakhisEvaluation.n,
  pannukeTest: pannukeEvaluationSource.images,
  ptbxlTest: cardioNotebookEvaluation.nEcg,
};

export const aiModels = [
  // --- Brain -----------------------------------------------------------------
  {
    id: "brain-efficientnetb4-tumor-classification",
    module: "brain",
    version: "1.0",
    architecture: "EfficientNetB4",
    task: "classification",
    inputModality: "brainMri2d",
    acceptedFormats: ["png", "jpeg"],
    // The model's raw output labels, in index order.
    outputClasses: ["glioma", "meningioma", "notumor", "pituitary"],
    inputConstraints: null,
    // Test accuracy of the service (one pass) first: it is the main metric.
    metrics: [
      {
        key: "testAccuracy",
        value: classification.accuracy.value,
        ci95: classification.accuracy.ci95,
        unit: "percent",
        approximate: false,
        dataset: "brainClassificationTest",
        source: "evaluation",
      },
      {
        key: "testAuc",
        value: classification.macroAuc,
        ci95: null,
        unit: "score",
        approximate: false,
        dataset: "brainClassificationTest",
        source: "evaluation",
      },
      // Notebook figure, sheet only: the folds it is measured on also chose
      // when training stopped, so it is optimistic.
      { key: "cvAccuracy", value: 0.9927, ci95: null, unit: "percent", approximate: false, dataset: "crossValidation", source: "notebook" },
    ],
    classMetrics: brainClassLabels.map((classKey) => ({
      classKey,
      precision: classification.perClass[classKey].precision,
      recall: classification.perClass[classKey].recall,
      recallCi95: classification.perClass[classKey].recallCi95,
      f1: classification.perClass[classKey].f1,
      auc: classification.perClass[classKey].auc,
    })),
    classMetricsDataset: "brainClassificationTest",
    confusionMatrix: classification.confusionMatrix,
    evaluation: serviceEvaluation,
    trainingData: "Nickparvar + BraTS 2021",
    knownLimitations: ["notCertified", "internalValidation", "lowerGliomaRecall", "closedSet", "singleSlice"],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "brain-unet-glioma-segmentation",
    module: "brain",
    version: "1.0",
    architecture: "U-Net",
    task: "segmentation",
    inputModality: "brainMriT1ceFlairT2Composite",
    acceptedFormats: null,
    outputClasses: ["glioma"],
    inputConstraints: null,
    metrics: [
      { key: "validationDice", value: 0.8976, ci95: null, unit: "score", approximate: false, dataset: "gliomaValidation", source: "notebook" },
    ],
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: null,
    knownLimitations: ["notCertified", "internalValidation"],
    underrepresentedPopulations: null,
    // Needs a three-sequence composite the brain pipeline does not take.
    status: "requires_multisequence",
  },
  {
    id: "brain-unet-meningioma-segmentation",
    module: "brain",
    version: "5",
    architecture: "U-Net",
    task: "segmentation",
    inputModality: "brainMri",
    acceptedFormats: ["png", "jpeg"],
    outputClasses: ["meningioma"],
    inputConstraints: null,
    metrics: segmentationMetrics(meningioma, "meningiomaTest"),
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: serviceEvaluation,
    trainingData: "BRISC 2025",
    knownLimitations: ["notCertified", "internalValidation", "targetTumourOnly"],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "brain-unet-pituitary-segmentation",
    module: "brain",
    version: "5",
    architecture: "U-Net",
    task: "segmentation",
    inputModality: "brainMri",
    acceptedFormats: ["png", "jpeg"],
    outputClasses: ["pituitary"],
    inputConstraints: null,
    metrics: segmentationMetrics(pituitary, "pituitaryTest"),
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: serviceEvaluation,
    trainingData: "BRISC 2025",
    knownLimitations: ["notCertified", "internalValidation", "targetTumourOnly"],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "brain-flair-segmentation",
    module: "brain",
    version: "4",
    architecture: null,
    task: "segmentation",
    // Sequences as given by the model team ("T1ce → FLAIR").
    inputModality: "brainMriT1ceToFlair",
    acceptedFormats: null,
    outputClasses: [],
    inputConstraints: null,
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: null,
    knownLimitations: ["notCertified", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "documentation_pending",
  },
  // --- Cardiology ------------------------------------------------------------
  {
    id: "cardio-ecg-resnet1d-ptbxl-superdiagnostic",
    module: "cardiology",
    version: "1.0",
    architecture: "ResNet1D-34",
    task: "classification",
    inputModality: "ecg12Lead",
    // CSV/TXT with a header naming the 12 leads, or a WFDB record (.hea +
    // .dat) zipped. Never a paper ECG, a PDF or a photograph.
    acceptedFormats: ["csv", "txt", "zip"],
    // Multi-label: each class against its own threshold (model card).
    outputClasses: ecgClasses,
    inputConstraints: null,
    // The training notebook's test (PTB-XL fold 10), from the model card: not
    // measured on the service yet (scripts/evaluate_cardio.py needs PTB-XL).
    metrics: [
      {
        key: "ecgAucMacro",
        value: cardioNotebookEvaluation.aucMacro,
        ci95: null,
        unit: "score",
        approximate: false,
        dataset: "ptbxlTest",
        source: "notebook",
      },
    ],
    classMetrics: ecgClasses.map((classKey) => ({
      classKey,
      precision: cardioNotebookEvaluation.perClass[classKey].ppv,
      recall: cardioNotebookEvaluation.perClass[classKey].sensitivity,
      recallCi95: null,
      f1: cardioNotebookEvaluation.perClass[classKey].f1,
      auc: cardioNotebookEvaluation.perClass[classKey].auc,
    })),
    classMetricsDataset: "ptbxlTest",
    confusionMatrix: null,
    evaluation: null,
    trainingData: "PTB-XL 1.0.1",
    knownLimitations: ["notCertified", "internalValidation", "ecgFiveSuperclasses", "ecgLowerHypSensitivity", "ecgDigitalSignalOnly"],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "cardiology-densenet121-chest-xray",
    module: "cardiology",
    version: null,
    architecture: "DenseNet121",
    task: "classification",
    inputModality: "chestXray",
    acceptedFormats: null,
    outputClasses: ["normal", "cardiomegaly", "effusion", "edema"],
    inputConstraints: null,
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: null,
    knownLimitations: ["notCertified", "closedSet", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "cardiology-acdc-segmentation",
    module: "cardiology",
    version: null,
    architecture: null,
    task: "segmentation",
    // ACDC is the cine-MRI cardiac segmentation dataset.
    inputModality: "cardiacCineMri",
    acceptedFormats: null,
    outputClasses: ["leftVentricle", "rightVentricle", "myocardium"],
    inputConstraints: null,
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: "ACDC",
    knownLimitations: ["notCertified", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "in_design",
  },
  {
    id: "cardiology-ct-heart-segmentation",
    module: "cardiology",
    version: null,
    architecture: null,
    task: "segmentation",
    inputModality: "cardiacCt",
    acceptedFormats: null,
    outputClasses: [],
    inputConstraints: null,
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: null,
    knownLimitations: ["notCertified", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "in_design",
  },
  // --- Pathology -------------------------------------------------------------
  {
    id: "pathology-breakhis-classification",
    module: "pathology",
    version: null,
    architecture: "EfficientNetB0",
    task: "classification",
    inputModality: "breastHistopathologyHe",
    acceptedFormats: ["png", "jpeg"],
    // The model's two results; the score is compared with a calibrated threshold.
    outputClasses: ["benign", "malignant"],
    inputConstraints: null,
    metrics: breakhisMetrics,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: { labels: ["benign", "malignant"], matrix: breakhisEvaluation.confusionMatrix },
    evaluation: pathologyServiceEvaluation,
    trainingData: "BreakHis",
    knownLimitations: [
      "notCertified",
      "internalValidation",
      "fewTestPatients",
      "uncalibratedScore",
      "breastHeOnly",
      "magnificationDependent",
    ],
    underrepresentedPopulations: null,
    status: "available",
  },
  {
    id: "pathology-unet-pannuke-segmentation",
    module: "pathology",
    version: null,
    architecture: "U-Net (encodeur EfficientNetB0)",
    task: "segmentation",
    inputModality: "histopathologyHe40x",
    acceptedFormats: ["png", "jpeg"],
    outputClasses: ["neoplastic", "inflammatory", "connective", "dead", "epithelial"],
    // ai-service: 422 under 256 px on a side, over 4096 px (AI_NUCLEI_MAX_SIDE).
    inputConstraints: { minSide: 256, maxSide: 4096 },
    // The test measure first; the notebook's validation figure stays marked
    // as such.
    metrics: [
      {
        key: "testNucleiDice",
        value: pannukeEvaluation.nucleiMeanDice,
        ci95: null,
        unit: "score",
        approximate: false,
        dataset: "pannukeTest",
        source: "evaluation",
      },
      {
        key: "validationNucleiDice",
        value: pannukeNotebookValidation.nucleiMeanDice,
        ci95: null,
        unit: "score",
        approximate: false,
        dataset: "pannukeValidationFold2",
        source: "notebook",
      },
    ],
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: pannukeServiceEvaluation,
    trainingData: "PanNuke",
    knownLimitations: ["notCertified", "semanticNotInstances", "deadUnreliable", "he40xOnly", "tissueDependent"],
    underrepresentedPopulations: null,
    status: "available",
  },
] as const satisfies readonly AiModel[];

export type AiModelId = (typeof aiModels)[number]["id"];

// The launchable chains, never run one after another. Their models stay
// visible on the hub; only the pipeline itself is started (ai-service routes
// the brain chain the same way).
export const aiPipelines = [
  {
    id: "brain",
    module: "brain",
    kind: "routed",
    entryModelId: "brain-efficientnetb4-tumor-classification",
    segmenterByClass: {
      meningioma: "brain-unet-meningioma-segmentation",
      pituitary: "brain-unet-pituitary-segmentation",
    },
  },
  {
    id: "pathology-breast",
    module: "pathology",
    kind: "single",
    entryModelId: "pathology-breakhis-classification",
    segmenterByClass: {},
  },
  {
    id: "pathology-nuclei",
    module: "pathology",
    kind: "single",
    entryModelId: "pathology-unet-pannuke-segmentation",
    segmenterByClass: {},
  },
  {
    id: "cardio-ecg",
    module: "cardiology",
    kind: "single",
    entryModelId: "cardio-ecg-resnet1d-ptbxl-superdiagnostic",
    segmenterByClass: {},
  },
] as const satisfies readonly AiPipeline[];

/** The steps the hub lists for each chain (aiAnalyses.pipelines.<id>.steps.<step>). */
export const pipelineSteps: Readonly<Record<AiPipelineId, readonly string[]>> = {
  brain: ["classify", "segmentMeningioma", "segmentPituitary"],
  "pathology-breast": ["views", "threshold"],
  "pathology-nuclei": ["tiles", "classes"],
  "cardio-ecg": ["windows", "filter", "classes"],
};

export function findModel(modelId: string | null | undefined): AiModel | undefined {
  return aiModels.find((model) => model.id === modelId);
}

/**
 * Compatibility helper for old consumers. Only a pipeline's entry model is a
 * launch entry point; conditional segmenters must never be launched alone.
 */
export function findLaunchableModel(modelId: string | undefined) {
  const pipeline = pipelineForLegacyModel(modelId);
  return pipeline?.entryModelId === modelId
    ? aiModels.find((model) => model.id === modelId && model.status === "available")
    : undefined;
}

/** ?pipeline= of the "new analysis" route; undefined when unknown. */
export function findPipeline(pipelineId: string | undefined): AiPipeline | undefined {
  return aiPipelines.find((pipeline) => pipeline.id === pipelineId);
}

/** Where a model sits in a pipeline, or null when it is in none. */
export function getPipelineRole(
  modelId: string,
): { pipeline: AiPipeline; role: "entry" } | { pipeline: AiPipeline; role: "segmenter"; classKey: string } | null {
  for (const pipeline of aiPipelines) {
    if (pipeline.entryModelId === modelId) return { pipeline, role: "entry" };
    const entry = Object.entries(pipeline.segmenterByClass).find(([, id]) => id === modelId);
    if (entry) return { pipeline, role: "segmenter", classKey: entry[0] };
  }
  return null;
}

/**
 * Old links used ?model=<id>: a model that belongs to a pipeline opens that
 * pipeline, anything else has no launch route.
 */
export function pipelineForLegacyModel(modelId: string | undefined): AiPipeline | undefined {
  return modelId ? getPipelineRole(modelId)?.pipeline : undefined;
}

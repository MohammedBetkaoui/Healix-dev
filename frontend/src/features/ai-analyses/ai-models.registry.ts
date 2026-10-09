import { type AiDatasetKey, type AiModel, type AiModelMetric, type AiPipeline } from "./ai-analyses.types";
import {
  brainClassificationEvaluation,
  brainClassLabels,
  brainEvaluationSource,
  brainSegmentationEvaluation,
  type BrainSegmentationEvaluation,
} from "./brain-evaluation";

// Single source of truth of the AI models shown in HealixDZ. The metrics of
// the three deployed brain models are measured on the service itself
// (brain-evaluation.ts, source "evaluation"); the few other figures are read
// from the training notebooks (source "notebook"); the other facts come from
// the model team. Only what was provided is filled in: every other fact stays
// null and the UI shows "non renseigné". No metric may be added without its
// source (see ai-models.registry.test.ts).
// Names and intended uses are translated under aiAnalyses.models.<id>.

const classification = brainClassificationEvaluation;
const { meningioma, pituitary } = brainSegmentationEvaluation;
const serviceEvaluation = { date: brainEvaluationSource.date, report: brainEvaluationSource.report };

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
    id: "cardiology-densenet121-chest-xray",
    module: "cardiology",
    version: null,
    architecture: "DenseNet121",
    task: "classification",
    inputModality: "chestXray",
    acceptedFormats: null,
    outputClasses: ["normal", "cardiomegaly", "effusion", "edema"],
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
    id: "pathology-hovernet-nuclei-segmentation",
    module: "pathology",
    version: null,
    architecture: "HoVer-Net",
    task: "segmentation",
    inputModality: "histopathology",
    acceptedFormats: null,
    outputClasses: ["nuclei"],
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: null,
    knownLimitations: ["notCertified", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "exploring",
  },
  {
    id: "pathology-breakhis-classification",
    module: "pathology",
    version: null,
    architecture: null,
    task: "classification",
    // BreakHis is a breast histopathology image dataset.
    inputModality: "histopathology",
    acceptedFormats: null,
    outputClasses: [],
    metrics: null,
    classMetrics: null,
    classMetricsDataset: null,
    confusionMatrix: null,
    evaluation: null,
    trainingData: "BreakHis",
    knownLimitations: ["notCertified", "undocumentedPerformance"],
    underrepresentedPopulations: null,
    status: "exploring",
  },
] as const satisfies readonly AiModel[];

export type AiModelId = (typeof aiModels)[number]["id"];

// The launchable chains. Their models stay visible on the hub as components;
// only the pipeline itself is started (ai-service routes the same way).
export const aiPipelines = [
  {
    id: "brain",
    module: "brain",
    classifierId: "brain-efficientnetb4-tumor-classification",
    segmenterByClass: {
      meningioma: "brain-unet-meningioma-segmentation",
      pituitary: "brain-unet-pituitary-segmentation",
    },
  },
] as const satisfies readonly AiPipeline[];

export function findModel(modelId: string | null | undefined): AiModel | undefined {
  return aiModels.find((model) => model.id === modelId);
}

/**
 * Compatibility helper for old consumers. Only a pipeline classifier is a
 * launch entry point; conditional segmenters must never be launched alone.
 */
export function findLaunchableModel(modelId: string | undefined) {
  const pipeline = pipelineForLegacyModel(modelId);
  return pipeline?.classifierId === modelId
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
): { pipeline: AiPipeline; role: "classifier" } | { pipeline: AiPipeline; role: "segmenter"; classKey: string } | null {
  for (const pipeline of aiPipelines) {
    if (pipeline.classifierId === modelId) return { pipeline, role: "classifier" };
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

import { type AiModel, type AiPipeline } from "./ai-analyses.types";

// Single source of truth of the AI models shown in HealixDZ. Brain metrics
// are read from the training notebooks (October 2026); the other facts come
// from the model team. Only what was provided is filled in: every other fact
// stays null and the UI shows "non renseigné". No metric may be added without
// its source (see ai-models.registry.test.ts).
// Names and intended uses are translated under aiAnalyses.models.<id>.
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
    // Test accuracy first: it is the main metric.
    metrics: [
      { key: "testAccuracy", value: 0.9544, unit: "percent", approximate: false, dataset: "brainClassificationTest" },
      { key: "cvAccuracy", value: 0.9927, unit: "percent", approximate: false, dataset: "crossValidation" },
      { key: "testAuc", value: 0.9908, unit: "score", approximate: false, dataset: "brainClassificationTest" },
    ],
    classMetrics: [
      { classKey: "glioma", precision: 1.0, recall: 0.835 },
      { classKey: "meningioma", precision: 0.9, recall: 0.9825 },
      { classKey: "notumor", precision: 0.94, recall: 1.0 },
      { classKey: "pituitary", precision: 0.99, recall: 1.0 },
    ],
    classMetricsDataset: "brainClassificationTest",
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
    metrics: [{ key: "validationDice", value: 0.8976, unit: "score", approximate: false, dataset: "gliomaValidation" }],
    classMetrics: null,
    classMetricsDataset: null,
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
    metrics: [
      { key: "testDice", value: 0.9277, unit: "score", approximate: false, dataset: "meningiomaTest" },
      { key: "testIou", value: 0.8753, unit: "score", approximate: false, dataset: "meningiomaTest" },
      { key: "testSensitivity", value: 0.9576, unit: "percent", approximate: false, dataset: "meningiomaTest" },
    ],
    classMetrics: null,
    classMetricsDataset: null,
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
    metrics: [
      { key: "testDice", value: 0.8717, unit: "score", approximate: false, dataset: "pituitaryTest" },
      { key: "testIou", value: 0.7859, unit: "score", approximate: false, dataset: "pituitaryTest" },
      { key: "testSensitivity", value: 0.9156, unit: "percent", approximate: false, dataset: "pituitaryTest" },
    ],
    classMetrics: null,
    classMetricsDataset: null,
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

import {
  aiModelStatuses,
  aiModelTasks,
  aiModules,
  type AiModel,
} from "./ai-analyses.types";
import {
  aiModels as registry,
  aiPipelines,
  findLaunchableModel,
  findPipeline,
  getPipelineRole,
  pipelineForLegacyModel,
} from "./ai-models.registry";

// Through the declared type: the tests check data, not the literal types
// "as const" gives each entry.
const aiModels: readonly AiModel[] = registry;

// Metrics read from the two supplied training notebooks. The registry may
// hold no other figure: adding one means citing its source here.
const documentedMetrics = [
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "testAccuracy",
    value: 0.9544,
    unit: "percent",
    approximate: false,
    dataset: "brainClassificationTest",
  },
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "cvAccuracy",
    value: 0.9927,
    unit: "percent",
    approximate: false,
    dataset: "crossValidation",
  },
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "testAuc",
    value: 0.9908,
    unit: "score",
    approximate: false,
    dataset: "brainClassificationTest",
  },
  {
    modelId: "brain-unet-glioma-segmentation",
    key: "validationDice",
    value: 0.8976,
    unit: "score",
    approximate: false,
    dataset: "gliomaValidation",
  },
  {
    modelId: "brain-unet-meningioma-segmentation",
    key: "testDice",
    value: 0.9277,
    unit: "score",
    approximate: false,
    dataset: "meningiomaTest",
  },
  {
    modelId: "brain-unet-meningioma-segmentation",
    key: "testIou",
    value: 0.8753,
    unit: "score",
    approximate: false,
    dataset: "meningiomaTest",
  },
  {
    modelId: "brain-unet-meningioma-segmentation",
    key: "testSensitivity",
    value: 0.9576,
    unit: "percent",
    approximate: false,
    dataset: "meningiomaTest",
  },
  {
    modelId: "brain-unet-pituitary-segmentation",
    key: "testDice",
    value: 0.8717,
    unit: "score",
    approximate: false,
    dataset: "pituitaryTest",
  },
  {
    modelId: "brain-unet-pituitary-segmentation",
    key: "testIou",
    value: 0.7859,
    unit: "score",
    approximate: false,
    dataset: "pituitaryTest",
  },
  {
    modelId: "brain-unet-pituitary-segmentation",
    key: "testSensitivity",
    value: 0.9156,
    unit: "percent",
    approximate: false,
    dataset: "pituitaryTest",
  },
];

describe("aiModels registry", () => {
  it("has unique, kebab-case ids", () => {
    const ids = aiModels.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("uses only the known modules, tasks and statuses, and covers every module", () => {
    for (const model of aiModels) {
      expect(aiModules).toContain(model.module);
      expect(aiModelTasks).toContain(model.task);
      expect(aiModelStatuses).toContain(model.status);
    }
    expect(new Set(aiModels.map((model) => model.module))).toEqual(new Set(aiModules));
  });

  it("gives every available model at least one output class or a segmentation task", () => {
    const incomplete = aiModels
      .filter((model) => model.status === "available")
      .filter((model) => model.task !== "segmentation" && model.outputClasses.length === 0)
      .map((model) => model.id);

    expect(incomplete).toEqual([]);
  });

  it("holds no metric beyond the documented ones", () => {
    const metrics = aiModels.flatMap((model) =>
      (model.metrics ?? []).map((metric) => ({ modelId: model.id, ...metric })),
    );

    expect(metrics).toEqual(documentedMetrics);
  });

  it("marks an unknown metric set as null, never as an empty list", () => {
    for (const model of aiModels) {
      if (model.metrics !== null) {
        expect(model.metrics.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the model team's statuses", () => {
    expect(Object.fromEntries(aiModels.map((model) => [model.id, model.status]))).toEqual({
      "brain-efficientnetb4-tumor-classification": "available",
      "brain-unet-glioma-segmentation": "requires_multisequence",
      "brain-unet-meningioma-segmentation": "available",
      "brain-unet-pituitary-segmentation": "available",
      "brain-flair-segmentation": "documentation_pending",
      "cardiology-densenet121-chest-xray": "available",
      "cardiology-acdc-segmentation": "in_design",
      "cardiology-ct-heart-segmentation": "in_design",
      "pathology-hovernet-nuclei-segmentation": "exploring",
      "pathology-breakhis-classification": "exploring",
    });
  });

  it("only lets an available model start a new analysis", () => {
    expect(findLaunchableModel("brain-efficientnetb4-tumor-classification")?.status).toBe("available");
    expect(findLaunchableModel("brain-unet-meningioma-segmentation")).toBeUndefined();
    expect(findLaunchableModel("brain-unet-pituitary-segmentation")).toBeUndefined();
    expect(findLaunchableModel("cardiology-acdc-segmentation")).toBeUndefined();
    expect(findLaunchableModel("pathology-breakhis-classification")).toBeUndefined();
    expect(findLaunchableModel("unknown-model")).toBeUndefined();
    expect(findLaunchableModel(undefined)).toBeUndefined();
  });

  it("launches one brain pipeline and maps every legacy component to it", () => {
    expect(aiPipelines).toHaveLength(1);
    expect(findPipeline("brain")?.classifierId).toBe("brain-efficientnetb4-tumor-classification");
    expect(findPipeline("unknown")).toBeUndefined();
    expect(getPipelineRole("brain-efficientnetb4-tumor-classification")?.role).toBe("classifier");
    expect(getPipelineRole("brain-unet-meningioma-segmentation")?.role).toBe("segmenter");
    expect(getPipelineRole("brain-unet-pituitary-segmentation")?.role).toBe("segmenter");
    expect(pipelineForLegacyModel("brain-unet-meningioma-segmentation")?.id).toBe("brain");
    expect(pipelineForLegacyModel("brain-unet-pituitary-segmentation")?.id).toBe("brain");
    expect(pipelineForLegacyModel("brain-unet-glioma-segmentation")).toBeUndefined();
  });

  it("keeps the classifier per-class metrics exactly as measured", () => {
    expect(aiModels.find((model) => model.id === "brain-efficientnetb4-tumor-classification")?.classMetrics).toEqual([
      { classKey: "glioma", precision: 1, recall: 0.835 },
      { classKey: "meningioma", precision: 0.9, recall: 0.9825 },
      { classKey: "notumor", precision: 0.94, recall: 1 },
      { classKey: "pituitary", precision: 0.99, recall: 1 },
    ]);
  });

  it("lists every model as not certified", () => {
    for (const model of aiModels) {
      expect(model.knownLimitations).toContain("notCertified");
    }
  });
});

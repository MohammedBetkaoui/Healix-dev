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
import {
  brainClassificationEvaluation,
  brainEvaluationSource,
  brainSegmentationEvaluation,
} from "./brain-evaluation";

// Through the declared type: the tests check data, not the literal types
// "as const" gives each entry.
const aiModels: readonly AiModel[] = registry;

// Figures read in the training notebooks: the registry may hold no other
// notebook figure, and adding one means citing its source here.
const notebookMetrics = [
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "cvAccuracy",
    value: 0.9927,
    unit: "percent",
    approximate: false,
    dataset: "crossValidation",
    ci95: null,
    source: "notebook",
  },
  {
    modelId: "brain-unet-glioma-segmentation",
    key: "validationDice",
    value: 0.8976,
    unit: "score",
    approximate: false,
    dataset: "gliomaValidation",
    ci95: null,
    source: "notebook",
  },
];

// Figures measured on the service: exactly those of brain-evaluation.ts
// (itself checked against the evaluation report by brain-evaluation.test.ts).
const segmentationMetrics = (modelId: string, label: "meningioma" | "pituitary", dataset: string) => {
  const measured = brainSegmentationEvaluation[label];
  const common = { approximate: false, dataset, modelId, source: "evaluation" };
  return [
    { ...common, key: "testDice", value: measured.dice.mean, ci95: measured.dice.ci95, unit: "score" },
    { ...common, key: "testDiceMedian", value: measured.dice.median, ci95: null, unit: "score" },
    { ...common, key: "testSensitivity", value: measured.sensitivity.mean, ci95: measured.sensitivity.ci95, unit: "percent" },
    { ...common, key: "testIou", value: measured.iou.mean, ci95: measured.iou.ci95, unit: "score" },
  ];
};

const evaluationMetrics = [
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "testAccuracy",
    value: brainClassificationEvaluation.accuracy.value,
    ci95: brainClassificationEvaluation.accuracy.ci95,
    unit: "percent",
    approximate: false,
    dataset: "brainClassificationTest",
    source: "evaluation",
  },
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "testAuc",
    value: brainClassificationEvaluation.macroAuc,
    ci95: null,
    unit: "score",
    approximate: false,
    dataset: "brainClassificationTest",
    source: "evaluation",
  },
  ...segmentationMetrics("brain-unet-meningioma-segmentation", "meningioma", "meningiomaTest"),
  ...segmentationMetrics("brain-unet-pituitary-segmentation", "pituitary", "pituitaryTest"),
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

    expect(metrics.filter((metric) => metric.source === "notebook")).toEqual(notebookMetrics);
    expect(metrics.filter((metric) => metric.source === "evaluation")).toEqual(evaluationMetrics);
    expect(metrics).toHaveLength(notebookMetrics.length + evaluationMetrics.length);
  });

  it("puts the measured figures first: the main metric of a deployed model is never a notebook one", () => {
    expect(
      aiModels.filter((model) => model.evaluation !== null).map((model) => [model.id, model.metrics?.[0]?.key, model.metrics?.[0]?.source]),
    ).toEqual([
      ["brain-efficientnetb4-tumor-classification", "testAccuracy", "evaluation"],
      ["brain-unet-meningioma-segmentation", "testDice", "evaluation"],
      ["brain-unet-pituitary-segmentation", "testDice", "evaluation"],
    ]);
    for (const model of aiModels.filter((entry) => entry.evaluation !== null)) {
      expect(model.evaluation).toEqual({ date: brainEvaluationSource.date, report: brainEvaluationSource.report });
    }
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

  it("takes the classifier per-class metrics and confusion matrix from the evaluation", () => {
    const classifier = aiModels.find((model) => model.id === "brain-efficientnetb4-tumor-classification");

    expect(classifier?.classMetrics).toEqual(
      (["glioma", "meningioma", "notumor", "pituitary"] as const).map((classKey) => {
        const { precision, recall, recallCi95, f1, auc } = brainClassificationEvaluation.perClass[classKey];
        return { auc, classKey, f1, precision, recall, recallCi95 };
      }),
    );
    expect(classifier?.confusionMatrix).toEqual(brainClassificationEvaluation.confusionMatrix);
  });

  it("lists every model as not certified", () => {
    for (const model of aiModels) {
      expect(model.knownLimitations).toContain("notCertified");
    }
  });
});

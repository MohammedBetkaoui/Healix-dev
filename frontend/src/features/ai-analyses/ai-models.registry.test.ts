import {
  aiModelStatuses,
  aiModelTasks,
  aiModules,
  type AiModel,
} from "./ai-analyses.types";
import { aiModels as registry } from "./ai-models.registry";

// Through the declared type: the tests check data, not the literal types
// "as const" gives each entry.
const aiModels: readonly AiModel[] = registry;

// Metrics communicated by the model team (product brief, October 2026). The
// registry may hold no other figure: adding one means citing its source here.
const documentedMetrics = [
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "cvAccuracy",
    value: 0.9927,
    unit: "percent",
    approximate: true,
    dataset: null,
  },
  {
    modelId: "brain-efficientnetb4-tumor-classification",
    key: "auc",
    value: 0.99,
    unit: "score",
    approximate: true,
    dataset: null,
  },
  {
    modelId: "brain-unet-glioma-segmentation",
    key: "dice",
    value: 0.9,
    unit: "score",
    approximate: true,
    dataset: null,
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
      "brain-unet-glioma-segmentation": "available",
      "brain-unet-meningioma-segmentation": "available",
      "brain-unet-pituitary-segmentation": "available",
      "brain-flair-segmentation": "available",
      "cardiology-densenet121-chest-xray": "available",
      "cardiology-acdc-segmentation": "in_design",
      "cardiology-ct-heart-segmentation": "in_design",
      "pathology-hovernet-nuclei-segmentation": "exploring",
      "pathology-breakhis-classification": "exploring",
    });
  });

  it("lists every model as not certified", () => {
    for (const model of aiModels) {
      expect(model.knownLimitations).toContain("notCertified");
    }
  });
});

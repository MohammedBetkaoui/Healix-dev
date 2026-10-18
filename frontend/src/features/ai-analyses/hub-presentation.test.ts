import { type AiServiceStatus } from "./ai-analyses.types";
import { aiPipelines } from "./ai-models.registry";
import { getPipelineAvailability } from "./hub-presentation";

const brain = aiPipelines.find((pipeline) => pipeline.id === "brain")!;
const ecg = aiPipelines.find((pipeline) => pipeline.id === "cardio-ecg")!;

function service(loadedIds: string[]): AiServiceStatus {
  return {
    service: "available",
    models: loadedIds.map((modelId) => ({ modelId, loaded: true, weightsSha256: null, error: null })),
  };
}

describe("analysis catalog availability", () => {
  it("does not infer readiness from the registry before the service responds", () => {
    expect(getPipelineAvailability(brain)).toBe("unchecked");
  });

  it.each(["unavailable", "not_configured", "unauthorized", "error"] as const)("does not trust model data when the service is %s", (state) => {
    expect(getPipelineAvailability(ecg, { ...service([ecg.entryModelId]), service: state })).toBe("unavailable");
  });

  it("requires the entry model even when the conditional segmenters are loaded", () => {
    expect(getPipelineAvailability(brain, service(Object.values(brain.segmenterByClass)))).toBe("unavailable");
  });

  it("distinguishes a usable classifier with missing conditional segmentation", () => {
    expect(getPipelineAvailability(brain, service([brain.entryModelId]))).toBe("partial");
    expect(getPipelineAvailability(brain, service([brain.entryModelId, brain.segmenterByClass.meningioma]))).toBe("partial");
    expect(getPipelineAvailability(brain, service([brain.entryModelId, ...Object.values(brain.segmenterByClass)]))).toBe("ready");
  });

  it("checks the loaded flag and supports the ECG pipeline without segmenters", () => {
    const status = service([ecg.entryModelId]);
    expect(getPipelineAvailability(ecg, status)).toBe("ready");
    status.models[0].loaded = false;
    expect(getPipelineAvailability(ecg, status)).toBe("unavailable");
    expect(getPipelineAvailability(ecg, service([]))).toBe("unavailable");
  });
});

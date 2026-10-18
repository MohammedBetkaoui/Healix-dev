import { type AiPipeline, type AiServiceStatus } from "./ai-analyses.types";

// A routed analysis can still classify when a conditional segmenter is absent.
// Registry availability alone never proves the running service is ready.
export function getPipelineAvailability(pipeline: AiPipeline, status?: AiServiceStatus) {
  if (!status) return "unchecked";
  if (status.service !== "available") return "unavailable";

  const isLoaded = (id: string) => status.models.some((model) => model.modelId === id && model.loaded);
  if (!isLoaded(pipeline.entryModelId)) return "unavailable";
  return Object.values(pipeline.segmenterByClass).every(isLoaded) ? "ready" : "partial";
}

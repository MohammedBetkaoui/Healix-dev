"use client";

import { type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { findPipeline } from "@/features/ai-analyses/ai-models.registry";
import { type TimelineItem } from "@/features/ai-analyses/ai-timeline";
import {
  useAiAnalysisRunMask,
  useAiAnalysisRunOverlay,
  useAiAnalysisRunSlice,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { type TranslationFunction } from "@/lib/i18n";

import { ImageViewer } from "../viewer/ImageViewer";

type RunImagePaneProps = {
  item: TimelineItem;
  patientId: string;
  pipeline: AiPipelineId;
  t: TranslationFunction;
};

// The image of one analysis with what the model drew on it: the mask of a
// brain run, the colour overlay of a nuclei map or of a cardiac MRI (shown on
// the slice as analysed, which a DICOM source cannot be). An ECG has no image.
export function RunImagePane({ item, patientId, pipeline, t }: RunImagePaneProps) {
  const isEcg = pipeline === "cardio-ecg";
  const usesSlice = pipeline === "cardio-seg-mri";
  const aiModule = findPipeline(pipeline)?.module ?? "brain";
  const sourceQuery = usePatientDocumentView(patientId, item.sourceDocumentId, { enabled: !isEcg && !usesSlice });
  const sliceQuery = useAiAnalysisRunSlice(patientId, item.runId, { enabled: usesSlice && item.hasSlice });
  const maskQuery = useAiAnalysisRunMask(patientId, item.runId, { enabled: pipeline === "brain" && item.hasMask });
  const overlayQuery = useAiAnalysisRunOverlay(patientId, item.runId, { enabled: item.hasOverlay });

  if (isEcg) {
    return <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line)] p-6 text-sm text-[var(--ink-soft)]">{t("aiAnalyses.evolution.compare.noImage")}</p>;
  }

  const imageQuery = usesSlice ? sliceQuery : sourceQuery;
  const overlay = maskQuery.data
    ? ({ color: "var(--ai-module-color)", kind: "mask", opacity: 0.4, src: maskQuery.data } as const)
    : overlayQuery.data
      ? ({ kind: "image", opacity: 0.6, src: overlayQuery.data } as const)
      : undefined;

  return (
    <ImageViewer
      blob={imageQuery.data ?? null}
      fileName={t("aiAnalyses.evolution.compare.image")}
      module={aiModule}
      overlay={overlay}
      placeholder={imageQuery.isError ? t("aiAnalyses.evolution.compare.imageError") : t("aiAnalyses.evolution.compare.imageLoading")}
      t={t}
    />
  );
}

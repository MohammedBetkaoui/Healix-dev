"use client";

import { ArrowRight, Check } from "lucide-react";

import { type AiPipeline, type AiServiceStatus } from "@/features/ai-analyses/ai-analyses.types";
import { findModel } from "@/features/ai-analyses/ai-models.registry";
import { getPipelineAvailability } from "@/features/ai-analyses/hub-presentation";
import { type TranslationFunction } from "@/lib/i18n";

import { HealixSpecialtyArtwork } from "./HealixSpecialtyArtwork";

type AiPipelineCardProps = {
  pipeline: AiPipeline;
  index: string;
  selected: boolean;
  status?: AiServiceStatus;
  onSelect: () => void;
  t: TranslationFunction;
};

export function AiPipelineCard({ pipeline, index, selected, status, onSelect, t }: AiPipelineCardProps) {
  const model = findModel(pipeline.entryModelId);
  const availability = getPipelineAvailability(pipeline, status);
  const title = t(`aiAnalyses.hub.analyses.${pipeline.id}.title`);

  return (
    <button type="button" className="ai-hub-pipeline" data-module={pipeline.module} aria-pressed={selected} aria-controls="ai-hub-summary" onClick={onSelect}>
      <span className="ai-hub-pipeline-plate" aria-hidden="true">
        <span className="ai-hub-pipeline-index"><bdi>{index}</bdi><span>HealixDz</span></span>
        <HealixSpecialtyArtwork pipeline={pipeline.id} />
        <span className="ai-hub-plate-modality">{t(`aiAnalyses.tasks.${model?.task ?? "classification"}`)}</span>
      </span>
      <span className="ai-hub-pipeline-content">
        <span className="ai-hub-pipeline-specialty">{t(`aiAnalyses.modules.${pipeline.module}.title`)}</span>
        <span className="ai-hub-pipeline-name">{title}</span>
        <span className="ai-hub-pipeline-description">{t(`aiAnalyses.hub.analyses.${pipeline.id}.description`)}</span>
        <span className="ai-hub-pipeline-footer">
          <bdi dir="ltr" className="ai-hub-pipeline-formats">{model?.acceptedFormats?.join(" / ").toUpperCase()}</bdi>
          <span className="ai-hub-availability" data-state={availability}><span className="ai-hub-status-dot" />{t(`aiAnalyses.hub.availability.${availability}`)}</span>
        </span>
      </span>
      <span className="ai-hub-pipeline-action" aria-hidden="true">
        <span className="ai-hub-choice-mark">{selected ? <Check size={16} strokeWidth={2} /> : <ArrowRight size={16} className="clinical-directional" />}</span>
        <span>{selected ? t("aiAnalyses.hub.selected") : t("aiAnalyses.hub.select")}</span>
      </span>
    </button>
  );
}

"use client";

import { Activity, Check, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { useId } from "react";

import { type AiModule, type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { type LaunchState } from "@/features/ai-analyses/run-presentation";
import { type TranslationFunction } from "@/lib/i18n";

import { HealixSpecialtyArtwork } from "../HealixSpecialtyArtwork";
import { ImageViewer } from "../viewer/ImageViewer";

export const IMPRESSION_MAX_LENGTH = 500;

type ReadingStepProps = {
  blob: Blob | null;
  fileName: string;
  impression: string;
  isDicom: boolean;
  isError: boolean;
  isLaunching: boolean;
  launchError: { key: string | null; message?: string } | null;
  launchState: LaunchState;
  module: AiModule;
  onImpressionChange: (value: string) => void;
  onLaunch: () => void;
  pipelineId: AiPipelineId;
  canLaunch: boolean;
  preparationBlocker: string | null;
  acquisitionSummary: string[];
  onEditAcquisition: () => void;
  onRetryService: () => void;
  isRefreshingService: boolean;
  t: TranslationFunction;
};

export function ReadingStep({
  blob, fileName, impression, isDicom, isError, isLaunching, launchError,
  launchState, module, onImpressionChange, onLaunch, pipelineId, canLaunch,
  preparationBlocker, acquisitionSummary, onEditAcquisition, onRetryService,
  isRefreshingService, t,
}: ReadingStepProps) {
  const id = useId();
  const launchMessage = isLaunching
    ? t("aiAnalyses.wizard.reading.running")
    : launchError
      ? launchError.message || (launchError.key
        ? t(`aiAnalyses.wizard.reading.launchErrors.${launchError.key}`)
        : t("aiAnalyses.wizard.reading.launchError"))
      : preparationBlocker
        || (launchState !== "ready" ? t(`aiAnalyses.wizard.reading.launchStates.${launchState}`) : null);

  return (
    <div className="ai-reading">
      <div className="ai-reading-workspace">
        <div className="ai-reading-visual">
          {pipelineId === "cardio-ecg" ? (
            <div className="ai-reading-signal">
              <HealixSpecialtyArtwork pipeline={pipelineId} />
              <p><Activity size={16} aria-hidden="true" /><bdi>{fileName}</bdi></p>
              <span>{t("aiAnalyses.wizard.ecg.noPreview")}</span>
            </div>
          ) : (
            <ImageViewer
              blob={isDicom ? null : blob}
              fileName={fileName}
              module={module}
              placeholder={isDicom ? t("aiAnalyses.viewer.dicomUnavailable") : isError ? t("aiAnalyses.viewer.error") : t("aiAnalyses.viewer.loading")}
              t={t}
            />
          )}
        </div>
        <div className="ai-reading-notes">
          {acquisitionSummary.length > 0 ? (
            <section className="ai-reading-acquisition" aria-labelledby={`${id}-acquisition-title`}>
              <div><h3 id={`${id}-acquisition-title`}>{t("aiAnalyses.wizard.workspace.confirmedSettings")}</h3><button type="button" onClick={onEditAcquisition} disabled={isLaunching}>{t("aiAnalyses.wizard.workspace.edit")}</button></div>
              <ul>{acquisitionSummary.map((value) => <li key={value}><Check size={13} aria-hidden="true" />{value}</li>)}</ul>
            </section>
          ) : null}
          <div className="ai-reading-impression">
            <label htmlFor={`${id}-impression`}>{t("aiAnalyses.wizard.reading.impressionLabel")}<span>{t("aiAnalyses.wizard.workspace.optional")}</span></label>
            <p id={`${id}-hint`}>{t(`aiAnalyses.wizard.reading.impressionHints.${pipelineId}`)}</p>
            <textarea
              id={`${id}-impression`}
              rows={6}
              maxLength={IMPRESSION_MAX_LENGTH}
              value={impression}
              disabled={isLaunching}
              onChange={(event) => onImpressionChange(event.target.value)}
              aria-describedby={`${id}-hint ${id}-counter`}
              placeholder={t(`aiAnalyses.wizard.workspace.readingPlaceholders.${pipelineId}`)}
            />
            <p id={`${id}-counter`} className="ai-reading-counter">{t("aiAnalyses.wizard.reading.characters", { count: impression.length, max: IMPRESSION_MAX_LENGTH })}</p>
          </div>
        </div>
      </div>
      <div className="ai-reading-launch" aria-busy={isLaunching}>
        <div>
          <strong>{t("aiAnalyses.wizard.workspace.launchTitle")}</strong>
          <p>{t("aiAnalyses.wizard.workspace.launchHint")}</p>
        </div>
        <button type="button" className="clinical-button clinical-button-primary ai-wizard-launch-button" disabled={!canLaunch} aria-describedby={launchMessage ? `${id}-launch` : undefined} onClick={onLaunch}>
          {isLaunching ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <PlayCircle size={17} aria-hidden="true" />}
          {isLaunching ? t("aiAnalyses.wizard.workspace.launching") : t("aiAnalyses.wizard.reading.launch")}
        </button>
        {launchMessage ? (
          <p id={`${id}-launch`} role={launchError ? "alert" : undefined} aria-live={launchError ? undefined : "polite"} className="ai-reading-launch-message" data-error={Boolean(launchError)}>{launchMessage}</p>
        ) : null}
        {launchState !== "ready" && launchState !== "loading" && !isLaunching ? (
          <button type="button" className="ai-wizard-text-action" onClick={onRetryService} disabled={isRefreshingService}><RefreshCw size={14} className={isRefreshingService ? "animate-spin" : undefined} aria-hidden="true" />{t("aiAnalyses.hub.service.refresh")}</button>
        ) : null}
      </div>
    </div>
  );
}

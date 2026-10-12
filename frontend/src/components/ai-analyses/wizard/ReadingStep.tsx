"use client";

import { PlayCircle } from "lucide-react";
import { useId } from "react";

import {
  aiMagnifications,
  type AiMagnification,
  type AiModule,
  type AiPipelineId,
} from "@/features/ai-analyses/ai-analyses.types";
import { type LaunchState } from "@/features/ai-analyses/run-presentation";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ImageViewer } from "../viewer/ImageViewer";

export const IMPRESSION_MAX_LENGTH = 500;

type ReadingStepProps = {
  blob: Blob | null;
  fileName: string;
  /** pathology-nuclei: the physician confirmed an H&E image acquired at 40x. */
  he40xConfirmed: boolean;
  impression: string;
  isDicom: boolean;
  isError: boolean;
  isLaunching: boolean;
  /** A launch refused before any run; key: a known 400 code (launchErrors), or null. */
  launchError: { key: string | null } | null;
  launchState: LaunchState;
  /** pathology-breast: the magnification chosen, null until then. */
  magnification: AiMagnification | null;
  module: AiModule;
  onHe40xChange: (confirmed: boolean) => void;
  onImpressionChange: (value: string) => void;
  onLaunch: () => void;
  onMagnificationChange: (value: AiMagnification) => void;
  pipelineId: AiPipelineId;
  t: TranslationFunction;
};

export function ReadingStep({
  blob,
  fileName,
  he40xConfirmed,
  impression,
  isDicom,
  isError,
  isLaunching,
  launchError,
  launchState,
  magnification,
  module,
  onHe40xChange,
  onImpressionChange,
  onLaunch,
  onMagnificationChange,
  pipelineId,
  t,
}: ReadingStepProps) {
  const id = useId();
  const ids = {
    counter: `${id}-counter`,
    he40x: `${id}-he40x`,
    he40xHint: `${id}-he40x-hint`,
    hint: `${id}-hint`,
    launch: `${id}-launch`,
    magnificationHint: `${id}-magnification-hint`,
    textarea: `${id}-impression`,
  };
  const isReady = launchState === "ready";
  // The launch waits for the chain's own statement about the image.
  const choiceMissing =
    (pipelineId === "pathology-breast" && magnification === null) ||
    (pipelineId === "pathology-nuclei" && !he40xConfirmed);
  const launchMessage = isLaunching
    ? t("aiAnalyses.wizard.reading.running")
    : launchError
      ? launchError.key
        ? t(`aiAnalyses.wizard.reading.launchErrors.${launchError.key}`)
        : t("aiAnalyses.wizard.reading.launchError")
      : !isReady
        ? t(`aiAnalyses.wizard.reading.launchStates.${launchState}`)
        : choiceMissing
          ? pipelineId === "pathology-breast"
            ? t("aiAnalyses.wizard.reading.magnification.required")
            : t("aiAnalyses.wizard.reading.he40x.required")
          : null;
  const canLaunch = isReady && !choiceMissing && !isLaunching;

  return (
    <div className="space-y-5">
      <ImageViewer
        blob={isDicom ? null : blob}
        fileName={fileName}
        module={module}
        placeholder={
          isDicom
            ? t("aiAnalyses.viewer.dicomUnavailable")
            : isError
              ? t("aiAnalyses.viewer.error")
              : t("aiAnalyses.viewer.loading")
        }
        t={t}
      />

      {pipelineId === "pathology-breast" ? (
        <fieldset aria-describedby={ids.magnificationHint} className="space-y-2">
          <legend className="text-[.8rem] font-medium text-[var(--text-primary)]">
            {t("aiAnalyses.wizard.reading.magnification.legend")}
          </legend>
          <p id={ids.magnificationHint} className="text-xs text-[var(--text-secondary)]">
            {t("aiAnalyses.wizard.reading.magnification.hint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {aiMagnifications.map((value) => {
              const isSelected = magnification === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-magnification`}
                    value={value}
                    required
                    checked={isSelected}
                    className="accent-[var(--accent)]"
                    onChange={() => onMagnificationChange(value)}
                  />
                  <bdi dir="ltr">{t("aiAnalyses.wizard.reading.magnification.option", { value })}</bdi>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {pipelineId === "pathology-nuclei" ? (
        <div className="space-y-1.5">
          <label
            htmlFor={ids.he40x}
            className={cn(
              "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium text-[var(--text-primary)]",
              he40xConfirmed ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]",
            )}
          >
            <input
              id={ids.he40x}
              type="checkbox"
              required
              checked={he40xConfirmed}
              aria-describedby={ids.he40xHint}
              className="accent-[var(--accent)]"
              onChange={(event) => onHe40xChange(event.target.checked)}
            />
            {t("aiAnalyses.wizard.reading.he40x.label")}
          </label>
          <p id={ids.he40xHint} className="text-xs text-[var(--text-secondary)]">
            {t("aiAnalyses.wizard.reading.he40x.hint")}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor={ids.textarea} className="text-[.8rem] font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.wizard.reading.impressionLabel")}
        </label>
        <p id={ids.hint} className="text-xs text-[var(--text-secondary)]">
          {t(`aiAnalyses.wizard.reading.impressionHints.${pipelineId}`)}
        </p>
        <textarea
          id={ids.textarea}
          rows={4}
          maxLength={IMPRESSION_MAX_LENGTH}
          value={impression}
          onChange={(event) => onImpressionChange(event.target.value)}
          aria-describedby={`${ids.hint} ${ids.counter}`}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]"
        />
        <p id={ids.counter} className="text-end text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.wizard.reading.characters", { count: impression.length, max: IMPRESSION_MAX_LENGTH })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`clinical-button ${isReady && !choiceMissing ? "clinical-button-primary" : "clinical-button-unavailable"} disabled:cursor-not-allowed disabled:opacity-60`}
          disabled={!canLaunch}
          aria-describedby={launchMessage ? ids.launch : undefined}
          onClick={onLaunch}
        >
          <PlayCircle size={16} strokeWidth={1.8} aria-hidden="true" />
          {isLaunching ? t("aiAnalyses.wizard.reading.running") : t("aiAnalyses.wizard.reading.launch")}
        </button>
        {launchMessage ? (
          <p
            id={ids.launch}
            role={launchError ? "alert" : undefined}
            aria-live={launchError ? undefined : "polite"}
            className="text-sm text-[var(--text-secondary)]"
          >
            {launchMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

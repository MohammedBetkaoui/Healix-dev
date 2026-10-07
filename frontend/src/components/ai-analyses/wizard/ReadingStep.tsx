"use client";

import { PlayCircle } from "lucide-react";
import { useId } from "react";

import { type AiModule } from "@/features/ai-analyses/ai-analyses.types";
import { type LaunchState } from "@/features/ai-analyses/run-presentation";
import { type TranslationFunction } from "@/lib/i18n";

import { ImageViewer } from "../viewer/ImageViewer";

export const IMPRESSION_MAX_LENGTH = 500;

type ReadingStepProps = {
  blob: Blob | null;
  fileName: string;
  impression: string;
  isDicom: boolean;
  isError: boolean;
  isLaunching: boolean;
  launchError: boolean;
  launchState: LaunchState;
  module: AiModule;
  onImpressionChange: (value: string) => void;
  onLaunch: () => void;
  t: TranslationFunction;
};

export function ReadingStep({
  blob,
  fileName,
  impression,
  isDicom,
  isError,
  isLaunching,
  launchError,
  launchState,
  module,
  onImpressionChange,
  onLaunch,
  t,
}: ReadingStepProps) {
  const id = useId();
  const ids = { counter: `${id}-counter`, hint: `${id}-hint`, launch: `${id}-launch`, textarea: `${id}-impression` };
  const isReady = launchState === "ready";
  const launchMessage = isLaunching
    ? t("aiAnalyses.wizard.reading.running")
    : launchError
      ? t("aiAnalyses.wizard.reading.launchError")
      : isReady
        ? null
        : t(`aiAnalyses.wizard.reading.launchStates.${launchState}`);

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

      <div className="space-y-1.5">
        <label htmlFor={ids.textarea} className="text-[.8rem] font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.wizard.reading.impressionLabel")}
        </label>
        <p id={ids.hint} className="text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.wizard.reading.impressionHint")}
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
          className={`clinical-button ${isReady ? "clinical-button-primary" : "clinical-button-unavailable"} disabled:cursor-not-allowed disabled:opacity-60`}
          disabled={!isReady || isLaunching}
          aria-describedby={launchMessage ? ids.launch : undefined}
          onClick={onLaunch}
        >
          <PlayCircle size={16} strokeWidth={1.8} aria-hidden="true" />
          {isLaunching ? t("aiAnalyses.wizard.reading.running") : t("aiAnalyses.wizard.reading.launch")}
        </button>
        {launchMessage ? (
          <p id={ids.launch} role={launchError ? "alert" : undefined} className="text-sm text-[var(--text-secondary)]">
            {launchMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

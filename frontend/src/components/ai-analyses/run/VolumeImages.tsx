"use client";

import { useId, useState } from "react";

import {
  cardioSegStructures,
  type AiAnalysisRun,
  type AiVolumetry,
  type CardioSegStructure,
} from "@/features/ai-analyses/ai-analyses.types";
import { CARDIO_SEG_PALETTE } from "@/features/ai-analyses/cardio-seg-palette";
import { useAiAnalysisVolumeImage } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { useColorizedCardioSegMap } from "@/features/ai-analyses/hooks/use-colorized-label-map";
import {
  imagePhaseNumber,
  imagesDifferFromPhases,
  middleSlice,
  phaseNumber,
  sliceNumber,
  type VolumetryImagePhase,
} from "@/features/ai-analyses/volumetry";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ImageViewer } from "../viewer/ImageViewer";

const classKey: Record<CardioSegStructure, "leftVentricle" | "rightVentricle" | "myocardium"> = {
  LV: "leftVentricle",
  RV: "rightVentricle",
  MYO: "myocardium",
};

type VolumeImagesProps = {
  patientId: string;
  run: AiAnalysisRun;
  t: TranslationFunction;
  volumetry: AiVolumetry;
};

const phases: readonly VolumetryImagePhase[] = ["ed", "es"];

/**
 * The slices the model segmented at its end-diastole and end-systole, one image per slice position,
 * under their colour overlay. After the physician moves the phases, these stay the model's: it says so.
 */
export function VolumeImages({ patientId, run, t, volumetry }: VolumeImagesProps) {
  const id = useId();
  const [phase, setPhase] = useState<VolumetryImagePhase>("ed");
  const [chosenSlice, setChosenSlice] = useState<number | null>(null);
  const [visible, setVisible] = useState<ReadonlySet<CardioSegStructure>>(() => new Set(cardioSegStructures));
  const total = volumetry.images.slices;
  const slice = Math.min(chosenSlice ?? middleSlice(volumetry), Math.max(total - 1, 0));
  const allVisible = visible.size === cardioSegStructures.length;

  const sliceQuery = useAiAnalysisVolumeImage(patientId, run.id, "slice", phase, slice, { enabled: run.hasMask });
  const overlayQuery = useAiAnalysisVolumeImage(patientId, run.id, "overlay", phase, slice, { enabled: run.hasMask });
  const maskQuery = useAiAnalysisVolumeImage(patientId, run.id, "mask", phase, slice, { enabled: run.hasMask && !allVisible });
  const colorized = useColorizedCardioSegMap(maskQuery.data, visible);
  const overlay =
    colorized.status === "ready"
      ? colorized.blob
      : colorized.status === "pending"
        ? colorized.stale ?? overlayQuery.data
        : overlayQuery.data;
  const excluded = volumetry.effective.excludedSlices.includes(slice);
  const sliceLabel =
    slice === 0
      ? t("aiAnalyses.run.volumetry.images.base")
      : slice === total - 1
        ? t("aiAnalyses.run.volumetry.images.apex")
        : t("aiAnalyses.run.volumetry.images.sliceN", { slice: sliceNumber(slice) });

  const toggle = (structure: CardioSegStructure, shown: boolean) =>
    setVisible((current) => {
      const next = new Set(current);
      if (shown) next.add(structure);
      else next.delete(structure);
      return next;
    });

  return (
    <div className="space-y-4" data-volume-images="true">
      <p className="text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.images.hint")}</p>

      <div role="group" aria-label={t("aiAnalyses.run.volumetry.images.phaseLabel")} className="flex flex-wrap gap-2">
        {phases.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={phase === candidate}
            className={cn(
              "min-h-10 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm",
              phase === candidate
                ? "border-[var(--accent)] bg-[var(--surface-muted)] font-semibold text-[var(--text-primary)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]",
            )}
            onClick={() => setPhase(candidate)}
          >
            {t(`aiAnalyses.run.volumetry.phases.${candidate}`)}
            <span className="ms-2 text-xs font-normal">
              {t("aiAnalyses.run.volumetry.correction.phaseOption", { phase: imagePhaseNumber(volumetry, candidate) })}
            </span>
          </button>
        ))}
      </div>

      {imagesDifferFromPhases(volumetry) ? (
        <p role="note" className="rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--warning-ink)]">
          {t("aiAnalyses.run.volumetry.images.phaseDiffers", {
            ed: phaseNumber(volumetry.images.edPhase),
            es: phaseNumber(volumetry.images.esPhase),
          })}
        </p>
      ) : null}

      <ImageViewer
        blob={sliceQuery.data ?? null}
        fileName={t("aiAnalyses.run.volumetry.images.sliceName", { phase: phase.toUpperCase(), slice: sliceNumber(slice) })}
        module="cardiology"
        overlay={overlay ? { kind: "image", opacity: 0.6, src: overlay } : undefined}
        placeholder={sliceQuery.isError ? t("aiAnalyses.run.volumetry.images.error") : t("aiAnalyses.run.volumetry.images.loading")}
        t={t}
      />

      <div>
        <label htmlFor={`${id}-slice`} className="flex items-baseline justify-between gap-2 text-xs text-[var(--text-secondary)]">
          <span>{t("aiAnalyses.run.volumetry.images.sliderLabel")}</span>
          <span aria-live="polite">{t("aiAnalyses.run.volumetry.images.counter", { position: sliceNumber(slice), total })}</span>
        </label>
        <input
          id={`${id}-slice`}
          type="range"
          className="mt-1 w-full"
          disabled={total < 2}
          min={0}
          max={Math.max(total - 1, 0)}
          step={1}
          value={slice}
          aria-valuetext={t("aiAnalyses.run.volumetry.images.counter", { position: sliceNumber(slice), total })}
          onChange={(event) => setChosenSlice(Number(event.target.value))}
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]" data-slice-name="true">
          {t("aiAnalyses.run.volumetry.images.positionName", { label: sliceLabel, phase: imagePhaseNumber(volumetry, phase) })}
          {excluded ? ` · ${t("aiAnalyses.run.volumetry.images.excludedNote")}` : ""}
        </p>
      </div>

      <fieldset aria-describedby={`${id}-structures-hint`}>
        <legend className="text-sm font-semibold text-[var(--text-primary)]">{t("aiAnalyses.run.cardioSeg.structuresLegend")}</legend>
        <p id={`${id}-structures-hint`} className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.run.cardioSeg.structuresHint")}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {cardioSegStructures.map((structure) => (
            <li key={structure}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={visible.has(structure)}
                  onChange={(event) => toggle(structure, event.target.checked)}
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-[var(--border-strong)]"
                  style={{ backgroundColor: CARDIO_SEG_PALETTE[structure] }}
                />
                {t(`aiAnalyses.classes.${classKey[structure]}`)}
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 min-h-5 text-xs" aria-live="polite">
          {!allVisible && (maskQuery.isError || colorized.status === "error") ? (
            <span className="text-[var(--danger-ink)]">{t("aiAnalyses.run.cardioSeg.recolourError")}</span>
          ) : !allVisible && colorized.status === "pending" ? (
            <span className="text-[var(--text-secondary)]">{t("aiAnalyses.run.cardioSeg.recolouring")}</span>
          ) : null}
        </p>
      </fieldset>
    </div>
  );
}

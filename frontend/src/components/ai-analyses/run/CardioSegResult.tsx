"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

import {
  cardioSegStructures,
  type AiAnalysisRun,
  type CardioSegStructure,
} from "@/features/ai-analyses/ai-analyses.types";
import { CARDIO_SEG_PALETTE } from "@/features/ai-analyses/cardio-seg-palette";
import { formatEvaluationDate, isolate } from "@/features/ai-analyses/evaluation-presentation";
import {
  useAiAnalysisRunMask,
  useCardioSegEvaluation,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { useColorizedCardioSegMap } from "@/features/ai-analyses/hooks/use-colorized-label-map";
import { getCardioSegPredictions } from "@/features/ai-analyses/run-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ImageViewer } from "../viewer/ImageViewer";
import { RunImageSection } from "./RunImageSection";

const classKey: Record<CardioSegStructure, "leftVentricle" | "rightVentricle" | "myocardium"> = {
  LV: "leftVentricle",
  RV: "rightVentricle",
  MYO: "myocardium",
};

function Swatch({ structure }: { structure: CardioSegStructure }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-[var(--border-strong)]"
      style={{ backgroundColor: CARDIO_SEG_PALETTE[structure] }}
    />
  );
}

type CardioSegResultProps = {
  locale: Locale;
  overlayBlob: Blob | undefined;
  patientId: string;
  run: AiAnalysisRun;
  sliceBlob: Blob | undefined;
  sliceError: boolean;
  t: TranslationFunction;
};

/** One short-axis cine-MRI slice: overlay, per-structure area and model metrics. */
export function CardioSegResult({
  locale,
  overlayBlob,
  patientId,
  run,
  sliceBlob,
  sliceError,
  t,
}: CardioSegResultProps) {
  const id = useId();
  const [visible, setVisible] = useState<ReadonlySet<CardioSegStructure>>(
    () => new Set(cardioSegStructures),
  );
  const allVisible = visible.size === cardioSegStructures.length;
  const maskQuery = useAiAnalysisRunMask(patientId, run.id, {
    enabled: run.hasMask && !allVisible,
  });
  const colorized = useColorizedCardioSegMap(maskQuery.data, visible);
  const recolourFailed =
    !allVisible && (maskQuery.isError || colorized.status === "error");
  const overlay =
    colorized.status === "ready"
      ? colorized.blob
      : colorized.status === "pending"
        ? colorized.stale ?? overlayBlob
        : overlayBlob;
  const predictions = getCardioSegPredictions(run);
  const evaluation = useCardioSegEvaluation(run.segmentationWeightsSha256);
  const evaluationData = evaluation.data;
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const integer = new Intl.NumberFormat(intlLocale);
  const decimal = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const dice = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  });

  const toggle = (structure: CardioSegStructure, shown: boolean) =>
    setVisible((current) => {
      const next = new Set(current);
      if (shown) next.add(structure);
      else next.delete(structure);
      return next;
    });

  return (
    <div className="ai-result space-y-5" data-module="cardiology">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <RunImageSection
          accentClassName="border-t-[color:var(--ai-module-color)]"
          hint={t("aiAnalyses.run.cardioSeg.imageHint")}
          t={t}
        >
          <ImageViewer
            blob={sliceBlob ?? null}
            fileName={t("aiAnalyses.run.cardioSeg.sliceName")}
            module="cardiology"
            overlay={overlay ? { kind: "image", opacity: 0.6, src: overlay } : undefined}
            placeholder={
              sliceError
                ? t("aiAnalyses.run.imageError")
                : t("aiAnalyses.run.imageLoading")
            }
            t={t}
          />

          <fieldset className="mt-4" aria-describedby={`${id}-structures-hint`}>
            <legend className="text-sm font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.cardioSeg.structuresLegend")}
            </legend>
            <p id={`${id}-structures-hint`} className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.run.cardioSeg.structuresHint")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {cardioSegStructures.map((structure) => (
                <li key={structure}>
                  <label
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]",
                      !run.hasMask && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={visible.has(structure)}
                      disabled={!run.hasMask}
                      onChange={(event) => toggle(structure, event.target.checked)}
                    />
                    <Swatch structure={structure} />
                    {t(`aiAnalyses.classes.${classKey[structure]}`)}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 min-h-5 text-xs" aria-live="polite">
              {recolourFailed ? (
                <span className="text-[var(--danger-ink)]">
                  {t("aiAnalyses.run.cardioSeg.recolourError")}
                </span>
              ) : !allVisible && colorized.status === "pending" ? (
                <span className="text-[var(--text-secondary)]">
                  {t("aiAnalyses.run.cardioSeg.recolouring")}
                </span>
              ) : null}
            </p>
          </fieldset>
        </RunImageSection>

        <section aria-labelledby="ai-run-cardio-seg-surfaces" className="surface-section p-5">
          <h2 id="ai-run-cardio-seg-surfaces" className="text-base font-semibold text-[var(--text-primary)]">
            {t("aiAnalyses.run.cardioSeg.surfacesTitle")}
          </h2>
          {predictions ? (
            <>
              {predictions.noStructureFound ? (
                <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning-ink)]">
                  {t("aiAnalyses.run.cardioSeg.noStructure")}
                </p>
              ) : null}
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                    <th scope="col" className="pb-1 pe-3 text-start font-medium">
                      {t("aiAnalyses.run.cardioSeg.structure")}
                    </th>
                    <th scope="col" className="pb-1 pe-3 text-end font-medium">
                      {t("aiAnalyses.run.cardioSeg.pixels")}
                    </th>
                    {predictions.pixelSpacingMm ? (
                      <th scope="col" className="pb-1 text-end font-medium">
                        {t("aiAnalyses.run.cardioSeg.areaMm2")}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {cardioSegStructures.map((structure) => {
                    const area = predictions.structures[structure];
                    return (
                      <tr key={structure} className="border-b border-[var(--line-soft)]">
                        <th scope="row" className="py-2 pe-3 text-start font-normal">
                          <span className="flex items-center gap-2">
                            <Swatch structure={structure} />
                            {t(`aiAnalyses.classes.${classKey[structure]}`)}
                          </span>
                        </th>
                        <td className="py-2 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                          <bdi dir="ltr">{integer.format(area.pixels)}</bdi>
                        </td>
                        {predictions.pixelSpacingMm ? (
                          <td className="py-2 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                            <bdi dir="ltr">
                              {area.areaMm2 === null ? "—" : decimal.format(area.areaMm2)}
                            </bdi>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                {predictions.pixelSpacingMm
                  ? t("aiAnalyses.run.cardioSeg.mm2Note", {
                      column: isolate(decimal.format(predictions.pixelSpacingMm[1])),
                      row: isolate(decimal.format(predictions.pixelSpacingMm[0])),
                    })
                  : t("aiAnalyses.run.cardioSeg.pixelNote")}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {t("aiAnalyses.run.none")}
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="ai-run-cardio-seg-metrics" className="surface-section p-5">
        <h2 id="ai-run-cardio-seg-metrics" className="text-base font-semibold text-[var(--text-primary)]">
          {t("aiAnalyses.run.cardioSeg.metricsTitle")}
        </h2>
        {evaluation.isLoading ? (
          <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">
            {t("aiAnalyses.run.cardioSeg.metricsLoading")}
          </p>
        ) : !evaluationData ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t("aiAnalyses.run.cardioSeg.metricsNone")}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {evaluationData.source === "service" && evaluationData.generatedAt
                ? t("aiAnalyses.run.cardioSeg.metricsService", {
                    date: formatEvaluationDate(evaluationData.generatedAt.slice(0, 10), locale),
                    patients: isolate(integer.format(evaluationData.testPatients)),
                    volumes: isolate(integer.format(evaluationData.nVolumes)),
                  })
                : t("aiAnalyses.run.cardioSeg.metricsNotebook", {
                    patients: isolate(integer.format(evaluationData.testPatients)),
                    volumes: isolate(integer.format(evaluationData.nVolumes)),
                  })}
            </p>
            <table className="mt-3 w-full max-w-xl text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                  <th scope="col" className="py-1.5 pe-3 text-start font-medium">
                    {t("aiAnalyses.run.cardioSeg.structure")}
                  </th>
                  <th scope="col" className="py-1.5 text-end font-medium">
                    {t("aiAnalyses.run.cardioSeg.dice3d")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cardioSegStructures.map((structure) => (
                  <tr key={structure} className="border-b border-[var(--line-soft)]">
                    <th scope="row" className="py-1.5 pe-3 text-start font-normal">
                      {t(`aiAnalyses.classes.${classKey[structure]}`)}
                    </th>
                    <td className="py-1.5 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{dice.format(evaluationData.perClass[structure].mean)}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.cardioSeg.meanDice", {
                value: isolate(dice.format(evaluationData.meanDice)),
              })}
            </p>
          </>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
          {t("aiAnalyses.run.cardioSeg.singleSliceWarning")}
        </p>
      </section>
    </div>
  );
}

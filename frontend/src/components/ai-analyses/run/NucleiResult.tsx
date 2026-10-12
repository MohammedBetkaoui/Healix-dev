"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

import { nucleusTypes, type AiAnalysisRun, type NucleusType } from "@/features/ai-analyses/ai-analyses.types";
import { formatEvaluationDate, isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useAiAnalysisRunMask } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { useColorizedLabelMap } from "@/features/ai-analyses/hooks/use-colorized-label-map";
import { NUCLEI_PALETTE } from "@/features/ai-analyses/nuclei-palette";
import { pannukeEvaluation, pannukeEvaluationSource } from "@/features/ai-analyses/pathology-evaluation";
import { pannukeEvaluationApplies } from "@/features/ai-analyses/pathology-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ImageViewer } from "../viewer/ImageViewer";
import { RunImageSection } from "./RunImageSection";

// Shown as such, greyed: rare in PanNuke and poorly segmented.
const UNRELIABLE: NucleusType = "dead";

type NucleiResultProps = {
  imageBlob: Blob | null;
  imageError: boolean;
  imageName: string;
  locale: Locale;
  /** The colour overlay (GET .../overlay), shown while every type is visible. */
  overlayBlob: Blob | undefined;
  patientId: string;
  /** A SUCCEEDED pathology-nuclei run. */
  run: AiAnalysisRun;
  t: TranslationFunction;
};

function Swatch({ type }: { type: NucleusType }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-[var(--border-strong)]"
      style={{ backgroundColor: NUCLEI_PALETTE[type] }}
    />
  );
}

// Nuclei map: the overlay over the image, a name and a colour per type (one
// checkbox each to show or hide it), then surfaces, never counts.
export function NucleiResult({ imageBlob, imageError, imageName, locale, overlayBlob, patientId, run, t }: NucleiResultProps) {
  const id = useId();
  const [visible, setVisible] = useState<ReadonlySet<NucleusType>>(() => new Set(nucleusTypes));
  const allVisible = visible.size === nucleusTypes.length;
  // The label map is fetched only once a type is hidden: it is recoloured here.
  const maskQuery = useAiAnalysisRunMask(patientId, run.id, { enabled: run.hasMask && !allVisible });
  const colorized = useColorizedLabelMap(maskQuery.data, visible);
  const recolourFailed = !allVisible && (maskQuery.isError || colorized.status === "error");
  const overlaySrc =
    colorized.status === "ready" ? colorized.blob : colorized.status === "pending" ? (colorized.stale ?? overlayBlob) : overlayBlob;

  const fractions = run.nucleiFractions;
  const shares = fractions ? nucleusTypes.map((type) => ({ share: fractions.nucleusTypes[type], type })) : [];
  const hasNuclei = shares.some((entry) => entry.share !== null);
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1, style: "percent" });
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const integer = new Intl.NumberFormat(intlLocale);
  // Kept in a local so the narrowing below survives into callbacks.
  const evaluation = pannukeEvaluation;
  const performanceApplies = pannukeEvaluationApplies(run.segmentationWeightsSha256);

  const toggle = (type: NucleusType, shown: boolean) =>
    setVisible((current) => {
      const next = new Set(current);
      if (shown) next.add(type);
      else next.delete(type);
      return next;
    });

  return (
    <div className="ai-result space-y-5" data-module="pathology">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <RunImageSection accentClassName="border-t-[color:var(--ai-module-color)]" hint={t("aiAnalyses.run.pathology.nuclei.imageHint")} t={t}>
          <ImageViewer
            blob={imageBlob}
            fileName={imageName}
            module="pathology"
            overlay={overlaySrc ? { kind: "image", opacity: 0.6, src: overlaySrc } : undefined}
            placeholder={imageError ? t("aiAnalyses.run.imageError") : t("aiAnalyses.run.imageLoading")}
            t={t}
          />
          <fieldset className="mt-4" aria-describedby={`${id}-types-hint`}>
            <legend className="text-sm font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.pathology.nuclei.typesLegend")}
            </legend>
            <p id={`${id}-types-hint`} className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.run.pathology.nuclei.typesHint")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {nucleusTypes.map((type) => (
                <li key={type}>
                  <label
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]",
                      !run.hasMask && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={visible.has(type)}
                      disabled={!run.hasMask}
                      onChange={(event) => toggle(type, event.target.checked)}
                    />
                    <Swatch type={type} />
                    {t(`aiAnalyses.classes.${type}`)}
                    {type === UNRELIABLE ? (
                      <span className="text-xs text-[var(--text-secondary)]">({t("aiAnalyses.run.pathology.nuclei.unreliable")})</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 min-h-5 text-xs" aria-live="polite">
              {recolourFailed ? (
                <span className="text-[var(--danger-ink)]">{t("aiAnalyses.run.pathology.nuclei.recolourError")}</span>
              ) : !allVisible && colorized.status === "pending" ? (
                <span className="text-[var(--text-secondary)]">{t("aiAnalyses.run.pathology.nuclei.recolouring")}</span>
              ) : null}
            </p>
          </fieldset>
        </RunImageSection>

        <div className="space-y-5">
          <section aria-labelledby="ai-run-surfaces" className="surface-section p-5">
            <h2 id="ai-run-surfaces" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.pathology.nuclei.surfacesTitle")}
            </h2>
            {fractions ? (
              <>
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  {t("aiAnalyses.run.pathology.nuclei.coverage", { value: isolate(percent.format(1 - fractions.background)) })}
                </p>
                {hasNuclei ? (
                  <table className="mt-4 w-full text-sm">
                    <caption className="mb-2 text-start text-xs leading-5 text-[var(--text-secondary)]">
                      {t("aiAnalyses.run.pathology.nuclei.compositionCaption")}
                    </caption>
                    <thead>
                      <tr className="text-xs text-[var(--text-secondary)]">
                        <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.run.pathology.nuclei.type")}</th>
                        <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.run.pathology.nuclei.share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shares.map(({ share, type }) => {
                        const unreliable = type === UNRELIABLE;
                        return (
                          <tr key={type} className={cn("border-t border-[var(--line-soft)] align-top", unreliable && "text-[var(--text-secondary)]")}>
                            <th scope="row" className="py-2 pe-3 text-start font-normal">
                              <span className="flex items-center gap-2">
                                <Swatch type={type} />
                                <span>
                                  {t(`aiAnalyses.classes.${type}`)}
                                  {unreliable ? (
                                    <span className="block text-xs">{t("aiAnalyses.run.pathology.nuclei.unreliable")}</span>
                                  ) : null}
                                </span>
                              </span>
                            </th>
                            <td className="w-1/2 py-2">
                              <bdi dir="ltr" className="font-[family-name:var(--font-auth-mono)] tabular-nums">
                                {share === null ? "—" : percent.format(share)}
                              </bdi>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--line-soft)]" dir="ltr" aria-hidden="true">
                                <div
                                  className={cn("h-full rounded-full", unreliable && "opacity-50")}
                                  style={{
                                    backgroundColor: unreliable ? "var(--text-secondary)" : NUCLEI_PALETTE[type],
                                    width: `${Math.max(0, Math.min(100, (share ?? 0) * 100))}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.pathology.nuclei.noNuclei")}</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
            )}
          </section>

          <section aria-labelledby="ai-run-notes" className="surface-section p-5">
            <h2 id="ai-run-notes" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.pathology.nuclei.notesTitle")}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm leading-6 text-[var(--text-secondary)]">
              <li>{t("aiAnalyses.run.pathology.nuclei.notes.surfaces")}</li>
              <li>{t("aiAnalyses.run.pathology.nuclei.notes.touching")}</li>
              <li>{t("aiAnalyses.run.pathology.nuclei.notes.training")}</li>
              {run.tileCount !== null ? (
                <li>
                  {run.tileCount === 1
                    ? t("aiAnalyses.run.pathology.nuclei.notes.tilesOne")
                    : t("aiAnalyses.run.pathology.nuclei.notes.tiles", { count: isolate(integer.format(run.tileCount)) })}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="ai-run-performance" className="surface-section p-5">
        <h2 id="ai-run-performance" className="text-base font-semibold text-[var(--text-primary)]">
          {t("aiAnalyses.run.pathology.nuclei.performanceTitle")}
        </h2>
        {evaluation === null ? (
          // No test measure: no figure at all, not even the notebook's.
          <p className="mt-3 flex items-start gap-2 text-sm text-[var(--text-primary)]">
            <Info size={17} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            {t("aiAnalyses.run.pathology.nuclei.performancePending")}
          </p>
        ) : !performanceApplies ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-[var(--text-primary)]">
            <Info size={17} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            {t("aiAnalyses.run.evaluationMismatch", { report: isolate(pannukeEvaluationSource.report) })}
          </p>
        ) : (
          <>
            <table className="mt-3 w-full max-w-md text-sm">
              <caption className="mb-2 text-start text-xs leading-5 text-[var(--text-secondary)]">
                {t("aiAnalyses.run.pathology.nuclei.performanceCaption")}
              </caption>
              <thead>
                <tr className="text-xs text-[var(--text-secondary)]">
                  <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.run.pathology.nuclei.type")}</th>
                  <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.run.pathology.nuclei.dice")}</th>
                </tr>
              </thead>
              <tbody>
                {nucleusTypes.map((type) => (
                  <tr key={type} className="border-t border-[var(--line-soft)]">
                    <th scope="row" className="py-1.5 pe-3 text-start font-normal">{t(`aiAnalyses.classes.${type}`)}</th>
                    <td className="py-1.5 font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{decimal.format(evaluation.perClass[type].dice)}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.sheet.nucleiMeanDice", { value: isolate(decimal.format(evaluation.nucleiMeanDice)) })}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.evaluation.sourcePannuke", {
                date: formatEvaluationDate(pannukeEvaluationSource.date, locale),
                report: isolate(pannukeEvaluationSource.report),
              })}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

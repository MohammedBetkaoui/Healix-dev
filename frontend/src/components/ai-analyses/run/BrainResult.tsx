"use client";

import { AlertTriangle, Info } from "lucide-react";

import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { brainEvaluationSource, UNCERTAINTY_THRESHOLD } from "@/features/ai-analyses/brain-evaluation";
import {
  evaluationMatchesWeights,
  getConfidenceSplit,
  getConfusionWarning,
  getProbabilityCeiling,
  isolate,
  isUncertain,
} from "@/features/ai-analyses/evaluation-presentation";
import { getTopLabel, sortPredictions } from "@/features/ai-analyses/run-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { ImageViewer } from "../viewer/ImageViewer";
import { RunImageSection } from "./RunImageSection";

type BrainResultProps = {
  imageBlob: Blob | null;
  imageError: boolean;
  imageName: string;
  locale: Locale;
  maskBlob: Blob | undefined;
  /** A SUCCEEDED brain run. */
  run: AiAnalysisRun;
  t: TranslationFunction;
};

// Brain MRI result: the classifier's probabilities, then the segmentation of
// the routed class, with the warnings measured on the test set.
export function BrainResult({ imageBlob, imageError, imageName, locale, maskBlob, run, t }: BrainResultProps) {
  const predictions = sortPredictions(run.predictions ?? []);
  const topLabel = getTopLabel(predictions);
  // The measured figures describe one set of classifier weights: they are
  // quoted only for a run made with those weights.
  const evaluationApplies = evaluationMatchesWeights(run.classificationWeightsSha256);
  const topProbability = predictions[0]?.probability ?? null;
  const uncertain = evaluationApplies && isUncertain(topProbability);
  const confidenceSplit = getConfidenceSplit();
  const confusionWarning = evaluationApplies ? getConfusionWarning(topLabel) : null;
  const probabilityCeiling = getProbabilityCeiling();
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });

  return (
    <>
      {!evaluationApplies ? (
        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <Info size={18} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-primary)]">
            {t("aiAnalyses.run.evaluationMismatch", { report: isolate(brainEvaluationSource.report) })}
          </p>
        </div>
      ) : null}

      {uncertain && topProbability !== null ? (
        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--warning-line)] border-s-[color:var(--warning)] bg-[var(--warning-soft)] px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[var(--warning-ink)]">{t("aiAnalyses.run.uncertainTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {confidenceSplit
                ? t("aiAnalyses.run.uncertainText", {
                    above: isolate(percent.format(confidenceSplit.aboveAccuracy)),
                    below: isolate(percent.format(confidenceSplit.belowAccuracy)),
                    probability: isolate(percent.format(topProbability)),
                    threshold: isolate(percent.format(UNCERTAINTY_THRESHOLD)),
                  })
                : t("aiAnalyses.run.uncertainTextNoSplit", {
                    probability: isolate(percent.format(topProbability)),
                    threshold: isolate(percent.format(UNCERTAINTY_THRESHOLD)),
                  })}
            </p>
          </div>
        </div>
      ) : null}

      {confusionWarning ? (
        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--warning-line)] border-s-[color:var(--warning)] bg-[var(--warning-soft)] px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t(
              confusionWarning.kind === "otherClasses"
                ? "aiAnalyses.run.confusion.otherClasses"
                : confusionWarning.negative
                  ? "aiAnalyses.run.confusion.missedGliomaNegative"
                  : "aiAnalyses.run.confusion.missedGlioma",
              {
                class: t(`aiAnalyses.classes.${confusionWarning.predicted}`),
                count: isolate(integer.format(confusionWarning.count)),
                total: isolate(integer.format(confusionWarning.total)),
              },
            )}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <RunImageSection accentClassName="border-t-[var(--specialty-brain)]" hint={t("aiAnalyses.run.imageHint")} t={t}>
          <ImageViewer
            blob={imageBlob}
            fileName={imageName}
            module="brain"
            overlay={maskBlob ? { color: "var(--ai-module-color)", kind: "mask", opacity: 0.4, src: maskBlob } : undefined}
            placeholder={imageError ? t("aiAnalyses.run.imageError") : t("aiAnalyses.run.imageLoading")}
            t={t}
          />
        </RunImageSection>

        <div className="space-y-5">
          <section aria-labelledby="ai-run-probabilities" className="surface-section p-5">
            <h2 id="ai-run-probabilities" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.probabilities")}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.probabilitiesHint")}</p>
            <ol className="mt-4 space-y-3">
              {predictions.map((prediction, index) => (
                <li key={prediction.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={index === 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                      {t(`aiAnalyses.classes.${prediction.label}`)}
                      {index === 0 ? <span className="ms-2 text-xs font-medium text-[var(--medical)]">— {t("aiAnalyses.run.topClass")}</span> : null}
                    </span>
                    <bdi dir="ltr" className="font-[var(--font-auth-mono)] tabular-nums text-[var(--text-primary)]">
                      {percent.format(prediction.probability)}
                    </bdi>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line-soft)]" dir="ltr">
                    <div
                      className="h-full rounded-full bg-[var(--specialty-brain)]"
                      style={{ width: `${Math.max(0, Math.min(100, prediction.probability * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {evaluationApplies ? (
              <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
                {probabilityCeiling.unreachedThreshold !== null
                  ? t("aiAnalyses.run.probabilityCeiling", {
                      target: isolate(percent.format(probabilityCeiling.target)),
                      threshold: isolate(percent.format(probabilityCeiling.unreachedThreshold)),
                    })
                  : t("aiAnalyses.run.probabilityCeilingNoBound", {
                      target: isolate(percent.format(probabilityCeiling.target)),
                    })}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="ai-run-segmentation" className="surface-section p-5">
            <h2 id="ai-run-segmentation" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.segmentation")}
            </h2>
            {run.hasMask && run.maskAreaPx !== null && run.maskAreaRatio !== null ? (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3">
                    <dt className="text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.areaPixelsLabel")}</dt>
                    <dd className="mt-1 font-[var(--font-auth-mono)] text-lg font-semibold tabular-nums">
                      {t("aiAnalyses.run.areaPx", { value: integer.format(run.maskAreaPx) })}
                    </dd>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3">
                    <dt className="text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.areaRatioLabel")}</dt>
                    <dd className="mt-1 font-[var(--font-auth-mono)] text-lg font-semibold tabular-nums">
                      {t("aiAnalyses.run.areaRatio", { value: percent.format(run.maskAreaRatio) })}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.areaNote")}</p>
              </>
            ) : run.segmentationSkippedReason ? (
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t(`aiAnalyses.run.skipped.${run.segmentationSkippedReason}`)}
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

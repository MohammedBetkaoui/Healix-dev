"use client";

import { AlertTriangle, Info } from "lucide-react";
import { type ReactNode } from "react";

import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { formatEvaluationDate, formatInterval, isolate } from "@/features/ai-analyses/evaluation-presentation";
import { testPatientsParams } from "@/features/ai-analyses/format-ai-metric";
import { breakhisEvaluation, pathologyEvaluationSource } from "@/features/ai-analyses/pathology-evaluation";
import {
  breakhisEvaluationApplies,
  formatScore,
  gaugePosition,
  getBreastWarning,
  getMagnificationMetrics,
  viewsDisagree,
} from "@/features/ai-analyses/pathology-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { ImageViewer } from "../viewer/ImageViewer";
import { RunImageSection } from "./RunImageSection";

// The service's views, in its order (ai-service: original, left-right flip,
// up-down flip, both).
const viewKeys = ["original", "flipHorizontal", "flipVertical", "flipBoth"] as const;

type BreastResultProps = {
  imageBlob: Blob | null;
  imageError: boolean;
  imageName: string;
  locale: Locale;
  /** A SUCCEEDED pathology-breast run. */
  run: AiAnalysisRun;
  t: TranslationFunction;
};

function Warning({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--warning-line)] border-s-[color:var(--warning)] bg-[var(--warning-soft)] px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
      <div>
        {title ? <p className="text-sm font-semibold text-[var(--warning-ink)]">{title}</p> : null}
        <p className={title ? "mt-1 text-sm text-[var(--text-primary)]" : "text-sm font-medium text-[var(--text-primary)]"}>{children}</p>
      </div>
    </div>
  );
}

// BreakHis result: a malignancy score (never a percentage, never called a
// probability) against the model's threshold, its 4 views, and the figures
// of the test set at the image's magnification.
export function BreastResult({ imageBlob, imageError, imageName, locale, run, t }: BreastResultProps) {
  const score = run.malignancyScore;
  const threshold = run.decisionThreshold;
  const views = run.ttaScores ?? [];
  // The figures describe one set of weights at one threshold.
  const evaluationApplies = breakhisEvaluationApplies(run.classificationWeightsSha256, threshold);
  const warning = evaluationApplies ? getBreastWarning(run.modelDecision, run.magnification) : null;
  const atMagnification = evaluationApplies ? getMagnificationMetrics(run.magnification) : null;
  const disagree = viewsDisagree(run.ttaScores, threshold);
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const integer = new Intl.NumberFormat(intlLocale);
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1, style: "percent" });
  const scoreText = (value: number) => isolate(formatScore(value, locale, threshold ?? undefined));
  const magnification = run.magnification === null ? null : isolate(integer.format(run.magnification));
  const result = run.modelDecision ? t(`aiAnalyses.classes.${run.modelDecision}`) : t("aiAnalyses.run.none");

  return (
    <div className="ai-result space-y-5" data-module="pathology">
      {!evaluationApplies ? (
        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <Info size={18} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-primary)]">
            {t("aiAnalyses.run.evaluationMismatch", { report: isolate(pathologyEvaluationSource.report) })}
          </p>
        </div>
      ) : null}

      {disagree ? (
        <Warning title={t("aiAnalyses.run.pathology.breast.viewsDisagreeTitle")}>
          {t("aiAnalyses.run.pathology.breast.viewsDisagreeText")}
        </Warning>
      ) : null}

      {warning && magnification ? (
        <Warning>
          {t(`aiAnalyses.run.pathology.breast.warnings.${warning.kind}`, {
            count: isolate(integer.format(warning.count)),
            magnification,
            total: isolate(integer.format(warning.total)),
          })}
        </Warning>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <RunImageSection accentClassName="border-t-[color:var(--ai-module-color)]" hint={t("aiAnalyses.run.pathology.breast.imageHint")} t={t}>
          <ImageViewer
            blob={imageBlob}
            fileName={imageName}
            module="pathology"
            placeholder={imageError ? t("aiAnalyses.run.imageError") : t("aiAnalyses.run.imageLoading")}
            t={t}
          />
        </RunImageSection>

        <div className="space-y-5">
          <section aria-labelledby="ai-run-score" className="surface-section p-5">
            <h2 id="ai-run-score" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.pathology.breast.scoreTitle")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.pathology.breast.scoreHint")}</p>
            {score !== null && threshold !== null ? (
              <>
                <p className="mt-4 text-sm font-semibold leading-6 text-[var(--text-primary)]">
                  {t("aiAnalyses.run.pathology.breast.scoreLine", {
                    result,
                    score: scoreText(score),
                    threshold: scoreText(threshold),
                  })}
                </p>
                {/* The sentence above says it all; the gauge only shows it. */}
                <div aria-hidden="true" className="mt-4" dir="ltr">
                  <div className="relative h-4 text-[.68rem] text-[var(--text-secondary)]">
                    <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${gaugePosition(threshold)}%` }}>
                      {t("aiAnalyses.run.pathology.breast.thresholdMark", { threshold: formatScore(threshold, locale) })}
                    </span>
                  </div>
                  <div className="relative mt-1 h-3 rounded-full bg-[var(--line-soft)]">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--ai-module-color)]" style={{ width: `${gaugePosition(score)}%` }} />
                    <div className="absolute -inset-y-1.5 w-0.5 bg-[var(--text-primary)]" style={{ left: `calc(${gaugePosition(threshold)}% - 1px)` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-[family-name:var(--font-auth-mono)] text-[.68rem] text-[var(--text-secondary)]">
                    <span>{formatScore(0, locale)}</span>
                    <span>{formatScore(1, locale)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
            )}
            {magnification ? (
              <p className="mt-4 text-xs text-[var(--text-secondary)]">
                {t("aiAnalyses.run.pathology.breast.magnification", { value: magnification })}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="ai-run-views" className="surface-section p-5">
            <h2 id="ai-run-views" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.pathology.breast.viewsTitle")}
            </h2>
            <p id="ai-run-views-hint" className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {t("aiAnalyses.run.pathology.breast.viewsHint")}
            </p>
            {views.length > 0 && threshold !== null ? (
              <table className="mt-3 w-full text-sm" aria-describedby="ai-run-views-hint">
                <tbody>
                  {views.map((view, index) => (
                    <tr key={viewKeys[index] ?? index} className="border-t border-[var(--line-soft)] first:border-t-0">
                      <th scope="row" className="py-1.5 pe-3 text-start font-normal text-[var(--text-primary)]">
                        {viewKeys[index] ? t(`aiAnalyses.run.pathology.breast.views.${viewKeys[index]}`) : null}
                      </th>
                      <td className="py-1.5 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                        <bdi dir="ltr">{formatScore(view, locale, threshold)}</bdi>
                      </td>
                      <td className="py-1.5 text-xs text-[var(--text-secondary)]">
                        {view >= threshold
                          ? t("aiAnalyses.run.pathology.breast.viewAbove")
                          : t("aiAnalyses.run.pathology.breast.viewBelow")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
            )}
          </section>
        </div>
      </div>

      {evaluationApplies ? (
        <section aria-labelledby="ai-run-performance" className="surface-section p-5">
          <h2 id="ai-run-performance" className="text-base font-semibold text-[var(--text-primary)]">
            {t("aiAnalyses.run.pathology.breast.performanceTitle")}
          </h2>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            {atMagnification && magnification ? (
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("aiAnalyses.run.pathology.breast.atMagnification", {
                    count: isolate(integer.format(atMagnification.n)),
                    magnification,
                  })}
                </h3>
                <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.pathology.breast.sensitivity")}</dt>
                  <dd className="text-end font-[family-name:var(--font-auth-mono)] tabular-nums"><bdi dir="ltr">{percent.format(atMagnification.sensitivity)}</bdi></dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.pathology.breast.specificity")}</dt>
                  <dd className="text-end font-[family-name:var(--font-auth-mono)] tabular-nums"><bdi dir="ltr">{percent.format(atMagnification.specificity)}</bdi></dd>
                </dl>
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("aiAnalyses.run.pathology.breast.overall", { count: isolate(integer.format(breakhisEvaluation.n)) })}
              </h3>
              <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
                {(["sensitivity", "specificity"] as const).map((name) => (
                  <div key={name} className="contents">
                    <dt className="text-[var(--text-secondary)]">{t(`aiAnalyses.run.pathology.breast.${name}`)}</dt>
                    <dd className="text-end">
                      <bdi dir="ltr" className="font-[family-name:var(--font-auth-mono)] tabular-nums">{percent.format(breakhisEvaluation[name].value)}</bdi>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {t("aiAnalyses.run.pathology.breast.patientInterval", {
                          range: isolate(formatInterval(breakhisEvaluation[name].ci95, "percent", locale)),
                        })}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <p className="mt-4 text-xs font-medium text-[var(--text-primary)]">
            {t("aiAnalyses.sheet.testPatients", testPatientsParams(locale))}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("aiAnalyses.evaluation.sourcePathology", {
              date: formatEvaluationDate(pathologyEvaluationSource.date, locale),
              report: isolate(pathologyEvaluationSource.report),
            })}
          </p>
        </section>
      ) : null}
    </div>
  );
}

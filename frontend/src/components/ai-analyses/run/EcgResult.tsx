"use client";

import { Activity, Circle, CircleDot, Info } from "lucide-react";
import { useId, useState } from "react";

import {
  ecgClasses,
  type AiAnalysisRun,
  type AiEcgTrace,
  type CardioEvaluation,
  type EcgClass,
} from "@/features/ai-analyses/ai-analyses.types";
import {
  barPosition,
  calibrationPath,
  ECG_CELL_SECONDS,
  ECG_RHYTHM_LEAD,
  ECG_TRACE_SECONDS,
  ecgGeometry,
  ecgLayout,
  ecgPaperSpeeds,
  getEcgClassResults,
  gridLines,
  tracePoints,
  type EcgPaperSpeed,
} from "@/features/ai-analyses/ecg-presentation";
import { formatEvaluationDate, isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useAiAnalysisRunEcgTrace, useCardioEvaluation } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { getEcgPredictions } from "@/features/ai-analyses/run-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type EcgResultProps = {
  locale: Locale;
  patientId: string;
  /** A SUCCEEDED cardio-ecg run. */
  run: AiAnalysisRun;
  t: TranslationFunction;
};

// A millimetre of paper on screen (96 dpi).
const PX_PER_MM = 3.78;

const className = (label: EcgClass, t: TranslationFunction) => `${t(`aiAnalyses.classes.${label}`)} (${label})`;

// The ECG result: the trace on standard paper, the 5 classes against their
// own thresholds, and the model's measured performance. The physician's
// decision comes after it, in AiRunDecisionPanel.
export function EcgResult({ locale, patientId, run, t }: EcgResultProps) {
  const predictions = getEcgPredictions(run);
  const traceQuery = useAiAnalysisRunEcgTrace(patientId, run.id, { enabled: run.hasTrace });
  const evaluationQuery = useCardioEvaluation(run.classificationWeightsSha256);
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1, style: "percent" });
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(intlLocale);

  return (
    <div className="ai-result space-y-5" data-module="cardiology">
      <section aria-labelledby="ai-run-ecg-trace" className="surface-section min-w-0 overflow-hidden border-t-2 border-t-[color:var(--ai-module-color)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--ai-line)] bg-[var(--ai-soft)] text-[var(--ai)]">
              <Activity size={17} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h2 id="ai-run-ecg-trace" className="text-base font-semibold text-[var(--text-primary)]">
                {t("aiAnalyses.run.ecg.traceTitle")}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.ecg.traceHint")}</p>
            </div>
          </div>
        </header>
        <div className="p-3 sm:p-4">
          {traceQuery.data ? (
            <EcgTraceViewer t={t} trace={traceQuery.data} />
          ) : (
            <p role={traceQuery.isError ? "alert" : "status"} className="px-2 py-6 text-sm text-[var(--text-secondary)]">
              {traceQuery.isError || !run.hasTrace ? t("aiAnalyses.run.ecg.traceError") : t("aiAnalyses.run.ecg.traceLoading")}
            </p>
          )}
          {predictions ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.run.ecg.signalFacts", {
                duration: isolate(decimal.format(predictions.durationSeconds)),
                rate: isolate(integer.format(predictions.inputSamplingRate)),
                windows: isolate(integer.format(predictions.windows)),
              })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
        <section aria-labelledby="ai-run-ecg-classes" className="surface-section p-5">
          <h2 id="ai-run-ecg-classes" className="text-base font-semibold text-[var(--text-primary)]">
            {t("aiAnalyses.run.ecg.probabilitiesTitle")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.ecg.probabilitiesHint")}</p>
          {predictions ? (
            <>
              <ul className="mt-4 space-y-4">
                {getEcgClassResults(predictions).map((result) => (
                  <ProbabilityBar key={result.label} percent={percent} result={result} t={t} />
                ))}
              </ul>
              {predictions.positive.length === 0 ? (
                <p className="mt-4 flex items-start gap-2 text-sm text-[var(--text-primary)]">
                  <Info size={16} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  {t("aiAnalyses.run.ecg.noPositive")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
          )}
        </section>

        <EcgMetrics
          evaluation={evaluationQuery.data ?? null}
          isLoading={evaluationQuery.isLoading}
          locale={locale}
          percent={percent}
          t={t}
        />
      </div>
    </div>
  );
}

function ProbabilityBar({
  percent,
  result,
  t,
}: {
  percent: Intl.NumberFormat;
  result: ReturnType<typeof getEcgClassResults>[number];
  t: TranslationFunction;
}) {
  const probability = isolate(percent.format(result.probability));
  const threshold = isolate(percent.format(result.threshold));
  const StatusIcon = result.positive ? CircleDot : Circle;

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className={cn("text-[var(--text-primary)]", result.positive && "font-semibold")}>{className(result.label, t)}</span>
        <span className="font-[family-name:var(--font-auth-mono)] tabular-nums text-[var(--text-primary)]">{probability}</span>
      </div>
      {/* The text says it all; the bar only shows it. */}
      <div aria-hidden="true" className="relative mt-1.5 h-2.5 rounded-full bg-[var(--line-soft)]" dir="ltr">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", result.positive ? "bg-[var(--accent)]" : "bg-[var(--chart-secondary)]")}
          style={{ width: `${barPosition(result.probability)}%` }}
        />
        <div className="absolute -inset-y-1 w-0.5 bg-[var(--text-primary)]" style={{ left: `calc(${barPosition(result.threshold)}% - 1px)` }} />
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
          <StatusIcon size={13} strokeWidth={2} aria-hidden="true" />
          {result.positive ? t("aiAnalyses.run.ecg.positive") : t("aiAnalyses.run.ecg.negative")}
        </span>
        <span>· {t("aiAnalyses.run.ecg.thresholdMark", { value: threshold })}</span>
        <span className="sr-only">
          {t("aiAnalyses.run.ecg.barLabel", { class: className(result.label, t), probability, threshold })}
        </span>
      </p>
    </li>
  );
}

function EcgMetrics({
  evaluation,
  isLoading,
  locale,
  percent,
  t,
}: {
  evaluation: CardioEvaluation | null;
  isLoading: boolean;
  locale: Locale;
  percent: Intl.NumberFormat;
  t: TranslationFunction;
}) {
  const score = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const integer = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const share = (value: number | null) => (value === null ? "—" : percent.format(value));

  return (
    <section aria-labelledby="ai-run-ecg-metrics" className="surface-section p-5">
      <h2 id="ai-run-ecg-metrics" className="text-base font-semibold text-[var(--text-primary)]">
        {t("aiAnalyses.run.ecg.metricsTitle")}
      </h2>
      {isLoading ? (
        <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.ecg.metricsLoading")}</p>
      ) : !evaluation ? (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.ecg.metricsNone")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {evaluation.source === "service" && evaluation.generatedAt
              ? t("aiAnalyses.run.ecg.metricsService", {
                  count: isolate(integer.format(evaluation.nEcg)),
                  date: formatEvaluationDate(evaluation.generatedAt.slice(0, 10), locale),
                })
              : t("aiAnalyses.run.ecg.metricsNotebook", { count: isolate(integer.format(evaluation.nEcg)) })}
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
            {t("aiAnalyses.run.ecg.aucMacro", { value: isolate(score.format(evaluation.aucMacro)) })}
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <th scope="col" className="py-1.5 pe-2 text-start font-medium">{t("aiAnalyses.run.ecg.class")}</th>
                <th scope="col" className="py-1.5 pe-2 text-end font-medium">{t("aiAnalyses.run.ecg.auc")}</th>
                <th scope="col" className="py-1.5 pe-2 text-end font-medium">{t("aiAnalyses.run.ecg.sensitivity")}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{t("aiAnalyses.run.ecg.specificity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)] font-[family-name:var(--font-auth-mono)] tabular-nums">
              {ecgClasses.map((label) => {
                const figures = evaluation.perClass[label];
                return (
                  <tr key={label}>
                    <th scope="row" className="py-1.5 pe-2 text-start font-[family-name:var(--font-auth-sans)] font-normal text-[var(--text-primary)]">
                      {t(`aiAnalyses.classes.${label}`)}
                    </th>
                    <td className="py-1.5 pe-2 text-end"><bdi dir="ltr">{score.format(figures.auc)}</bdi></td>
                    <td className="py-1.5 pe-2 text-end"><bdi dir="ltr">{share(figures.sensitivity)}</bdi></td>
                    <td className="py-1.5 text-end"><bdi dir="ltr">{share(figures.specificity)}</bdi></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// The 12 leads on standard ECG paper: 3 rows of 4 leads (2.5 s each), then
// lead II over the 10 s. Drawn in millimetres; the paper speed is the
// horizontal zoom. Always left to right, whatever the page direction.
export function EcgTraceViewer({ t, trace }: { t: TranslationFunction; trace: AiEcgTrace }) {
  const id = useId();
  const [speed, setSpeed] = useState<EcgPaperSpeed>(25);
  const geometry = ecgGeometry(speed);
  const { calibration, height, rowHeight, width } = geometry;
  const rate = trace.samplingRate;
  const baselineOf = (row: number) => row * rowHeight + rowHeight / 2;

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t("aiAnalyses.run.ecg.speed")}</legend>
        <span aria-hidden="true" className="text-xs font-medium text-[var(--text-secondary)]">{t("aiAnalyses.run.ecg.speed")}</span>
        {ecgPaperSpeeds.map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium",
              speed === value
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
            )}
          >
            <input
              type="radio"
              name={`${id}-speed`}
              className="accent-[var(--accent)]"
              checked={speed === value}
              onChange={() => setSpeed(value)}
            />
            <bdi dir="ltr">{t("aiAnalyses.run.ecg.speedOption", { value })}</bdi>
          </label>
        ))}
        <span className="text-xs text-[var(--text-secondary)]">· {t("aiAnalyses.run.ecg.calibration")}</span>
      </fieldset>

      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]" dir="ltr" tabIndex={0}>
        <svg
          className="ecg-paper block"
          role="img"
          aria-label={t("aiAnalyses.run.ecg.traceLabel", { speed })}
          viewBox={`0 0 ${width} ${height}`}
          width={width * PX_PER_MM}
          height={height * PX_PER_MM}
        >
          <rect width={width} height={height} className="ecg-paper-background" />
          <g>
            {gridLines(width).map(({ at, major }) => (
              <line key={`x${at}`} x1={at} y1={0} x2={at} y2={height} className={major ? "ecg-grid-major" : "ecg-grid-minor"} />
            ))}
            {gridLines(height).map(({ at, major }) => (
              <line key={`y${at}`} x1={0} y1={at} x2={width} y2={at} className={major ? "ecg-grid-major" : "ecg-grid-minor"} />
            ))}
          </g>

          {ecgLayout.map((leads, row) => {
            const baseline = baselineOf(row);
            return (
              <g key={leads.join("-")}>
                <path d={calibrationPath(baseline, speed)} className="ecg-trace" />
                {leads.map((lead, column) => {
                  const start = column * ECG_CELL_SECONDS;
                  const x0 = calibration + start * speed;
                  return (
                    <g key={lead}>
                      {column > 0 ? <line x1={x0} y1={baseline - 4} x2={x0} y2={baseline + 4} className="ecg-trace" /> : null}
                      <polyline
                        points={tracePoints(trace.leads[lead], rate, start, start + ECG_CELL_SECONDS, x0, baseline, speed)}
                        className="ecg-trace"
                      />
                      <text x={x0 + 1} y={row * rowHeight + 4} className="ecg-lead-label">{lead}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          <g>
            <path d={calibrationPath(baselineOf(ecgLayout.length), speed)} className="ecg-trace" />
            <polyline
              points={tracePoints(trace.leads[ECG_RHYTHM_LEAD], rate, 0, ECG_TRACE_SECONDS, calibration, baselineOf(ecgLayout.length), speed)}
              className="ecg-trace"
            />
            <text x={calibration + 1} y={ecgLayout.length * rowHeight + 4} className="ecg-lead-label">
              {t("aiAnalyses.run.ecg.rhythmStrip")}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

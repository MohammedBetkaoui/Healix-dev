"use client";

import { ChartLine, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { aiPipelineIds, type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import {
  availableMeasures,
  buildMeasureChart,
  busiestPipeline,
  countSucceeded,
  defaultPair,
  formatDay,
  formatDelta,
  formatMeasure,
  formatPercentChange,
  hasAreaMeasures,
  resultText,
  type MeasureInfo,
  type TimelineItem,
} from "@/features/ai-analyses/ai-timeline";
import { useAiAnalysisRuns } from "@/features/ai-analyses/hooks/use-ai-analysis-runs";
import { useAiTimeline } from "@/features/ai-analyses/hooks/use-ai-timeline";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AiComparison } from "./AiComparison";
import { AiMeasureChart } from "./AiMeasureChart";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";
const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

type AiEvolutionSectionProps = {
  locale: Locale;
  patientId: string;
  t: TranslationFunction;
};

// "Évolution IA", a tab of the patient record: one chain at a time, the main
// measure of its analyses over time, a table of the changes, and two analyses
// compared side by side. A 2D area is not a volume, and the comparisons that
// cannot be trusted say so.
export function AiEvolutionSection({ locale, patientId, t }: AiEvolutionSectionProps) {
  const id = useId();
  const runsQuery = useAiAnalysisRuns(patientId);
  const runs = runsQuery.data ?? [];
  const [pickedPipeline, setPickedPipeline] = useState<AiPipelineId | null>(null);
  const pipeline = pickedPipeline ?? busiestPipeline(runs);
  // The tab opens on the chain the patient has most runs of: wait to know it.
  const timelineQuery = useAiTimeline(patientId, pipeline, {
    enabled: pickedPipeline !== null || !runsQuery.isPending,
  });
  const timeline = timelineQuery.data;
  // What was picked belongs to the chain it was picked on.
  const [pickedMeasure, setPickedMeasure] = useState<{ key: string; pipeline: AiPipelineId } | null>(null);
  const [pickedPair, setPickedPair] = useState<{ earlierId: string; laterId: string; pipeline: AiPipelineId } | null>(null);

  const offered = timeline ? availableMeasures(timeline) : [];
  const measure: MeasureInfo | null =
    offered.find((candidate) => candidate.key === (pickedMeasure?.pipeline === pipeline ? pickedMeasure.key : timeline?.primaryMeasure)) ??
    offered[0] ??
    null;
  const chart = timeline && measure ? buildMeasureChart(timeline.items, measure) : null;
  const items = timeline?.items ?? [];
  const pair =
    pickedPair?.pipeline === pipeline && items.some((item) => item.runId === pickedPair.earlierId) && items.some((item) => item.runId === pickedPair.laterId)
      ? pickedPair
      : defaultPair(items);
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const integer = new Intl.NumberFormat(intlLocale);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5" data-pipeline={pipeline}>
      <header className="surface-section flex items-start gap-3 p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
          <ChartLine className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-[var(--ink)]">{t("aiAnalyses.evolution.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{t("aiAnalyses.evolution.subtitle")}</p>
        </div>
      </header>

      <div className="surface-section grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <label className="space-y-1.5" htmlFor={`${id}-pipeline`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.evolution.pipeline")}</span>
          <select id={`${id}-pipeline`} className={fieldClass} value={pipeline} onChange={(event) => setPickedPipeline(event.target.value as AiPipelineId)}>
            {aiPipelineIds.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t("aiAnalyses.evolution.pipelineOption", {
                  count: integer.format(countSucceeded(runs, candidate)),
                  name: t(`aiAnalyses.pipelines.${candidate}.name`),
                })}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-measure`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.evolution.measure")}</span>
          <select
            id={`${id}-measure`}
            className={cn(fieldClass, "disabled:cursor-not-allowed disabled:opacity-60")}
            disabled={offered.length === 0}
            value={measure?.key ?? ""}
            onChange={(event) => setPickedMeasure({ key: event.target.value, pipeline })}
          >
            {offered.map((candidate) => <option key={candidate.key} value={candidate.key}>{t(`aiAnalyses.evolution.measures.${candidate.key}`)}</option>)}
          </select>
        </label>
      </div>

      {hasAreaMeasures(pipeline) ? (
        <p role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--warning-ink)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.evolution.warning2d")}
        </p>
      ) : null}

      {timelineQuery.isError ? (
        <div role="alert" className="surface-section flex items-center gap-3 px-5 py-6 text-sm font-medium text-[var(--danger-ink)]">
          <ShieldAlert className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.evolution.error")}
        </div>
      ) : !timeline ? (
        <p className="surface-section px-5 py-6 text-sm text-[var(--ink-soft)]" aria-live="polite">{t("aiAnalyses.evolution.loading")}</p>
      ) : items.length === 0 ? (
        <p className="surface-section px-5 py-8 text-center text-sm text-[var(--ink-soft)]">{t("aiAnalyses.evolution.empty")}</p>
      ) : (
        <>
          {items.length === 1 ? (
            <p role="status" className="flex items-start gap-2 text-sm text-[var(--ink-soft)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
              {t("aiAnalyses.evolution.single")}
            </p>
          ) : null}

          <section className="surface-section overflow-hidden" aria-label={t("aiAnalyses.evolution.chart.title")}>
            <header className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
              <h3 className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.evolution.chart.title")}</h3>
              {measure ? <p className="mt-1 text-xs text-[var(--ink-faint)]">{t(`aiAnalyses.evolution.measures.${measure.key}`)}</p> : null}
            </header>
            <div className="p-4 sm:p-5">
              {chart && measure ? (
                <AiMeasureChart chart={chart} locale={locale} measure={measure} measureName={t(`aiAnalyses.evolution.measures.${measure.key}`)} t={t} />
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">{t("aiAnalyses.evolution.noValue")}</p>
              )}
            </div>
          </section>

          <EvolutionTable items={items} locale={locale} measure={measure} t={t} />

          {pair && items.length >= 2 ? (
            <AiComparison
              earlierId={pair.earlierId}
              laterId={pair.laterId}
              locale={locale}
              onChange={(next) => setPickedPair({ ...next, pipeline })}
              patientId={patientId}
              t={t}
              timeline={timeline}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function EvolutionTable({ items, locale, measure, t }: { items: TimelineItem[]; locale: Locale; measure: MeasureInfo | null; t: TranslationFunction }) {
  return (
    <section className="surface-section overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">{t("aiAnalyses.evolution.table.caption")}</caption>
          <thead className="bg-[var(--panel-soft)]">
            <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
              {(["date", "result", "value", "change", "decision", "source"] as const).map((column) => (
                <th key={column} scope="col" className="px-4 py-3 text-start font-semibold">{t(`aiAnalyses.evolution.table.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {items.map((item) => {
              const delta = measure ? item.comparison?.deltas[measure.key] ?? null : null;
              const caveats = item.comparison?.caveats ?? [];
              return (
                <tr key={item.runId} data-run={item.runId} className="align-top transition hover:bg-[var(--panel-soft)]">
                  <td className="whitespace-nowrap px-4 py-3"><time dateTime={item.createdAt}>{formatDay(item.createdAt, locale)}</time></td>
                  <td className="px-4 py-3 text-[var(--ink)]">{resultText(item, t)}</td>
                  <td className={`px-4 py-3 ${MONO}`}><bdi dir="ltr">{measure ? formatMeasure(item.measures[measure.key] ?? null, measure.unit, locale) : "—"}</bdi></td>
                  <td className="px-4 py-3">
                    {item.comparison === null ? (
                      <span className="text-[var(--ink-faint)]">{t("aiAnalyses.evolution.table.first")}</span>
                    ) : (
                      <>
                        <span className={MONO}>
                          <bdi dir="ltr">{measure ? formatDelta(delta, measure.unit, locale) : "—"}</bdi>
                          {delta?.percent != null ? <span className="ms-1 text-xs text-[var(--ink-faint)]">(<bdi dir="ltr">{formatPercentChange(delta, locale)}</bdi>)</span> : null}
                        </span>
                        <span
                          data-reliability={item.comparison.reliable ? "reliable" : "unreliable"}
                          title={caveats.map((caveat) => t(`aiAnalyses.evolution.caveats.${caveat}`)).join("\n")}
                          tabIndex={item.comparison.reliable ? undefined : 0}
                          className={cn(
                            "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
                            item.comparison.reliable
                              ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                              : "cursor-help border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
                          )}
                        >
                          {item.comparison.reliable ? t("aiAnalyses.evolution.table.reliable") : t("aiAnalyses.evolution.table.unreliable")}
                          {!item.comparison.reliable ? <span className="sr-only">{`: ${caveats.map((caveat) => t(`aiAnalyses.evolution.caveats.${caveat}`)).join(" ")}`}</span> : null}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{item.decisionStatus ? t(`aiAnalyses.decision.statuses.${item.decisionStatus}`) : t("aiAnalyses.evolution.table.none")}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{t(`aiAnalyses.evolution.sources.${item.source}`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import { Columns2, Info, ShieldAlert } from "lucide-react";
import { useId } from "react";

import {
  availableMeasures,
  compareTimelineItems,
  daysBetween,
  formatDay,
  formatDelta,
  formatMeasure,
  formatPercentChange,
  hasAreaMeasures,
  orderPair,
  resultText,
  type AiTimeline,
  type TimelineItem,
} from "@/features/ai-analyses/ai-timeline";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { RunImagePane } from "./RunImagePane";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";
const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

type AiComparisonProps = {
  earlierId: string;
  laterId: string;
  locale: Locale;
  onChange: (pair: { earlierId: string; laterId: string }) => void;
  patientId: string;
  t: TranslationFunction;
  timeline: AiTimeline;
};

function Pane({ heading, item, locale, patientId, pipeline, t }: {
  heading: string;
  item: TimelineItem;
  locale: Locale;
  patientId: string;
  pipeline: AiTimeline["pipeline"];
  t: TranslationFunction;
}) {
  return (
    <section aria-label={heading} className="min-w-0 space-y-2" data-run={item.runId}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--ink)]">{heading}</h4>
        <p className="text-xs text-[var(--ink-soft)]">
          <time dateTime={item.createdAt}>{formatDay(item.createdAt, locale)}</time>
          {" · "}
          {resultText(item, t)}
          {" · "}
          {t(`aiAnalyses.evolution.sources.${item.source}`)}
        </p>
      </header>
      <RunImagePane item={item} patientId={patientId} pipeline={pipeline} t={t} />
    </section>
  );
}

// Two analyses of the chain side by side: the images with their masks and
// overlays, and what changed measure by measure. Any two can be compared (not
// only neighbours); the comparison says when it cannot be trusted.
export function AiComparison({ earlierId, laterId, locale, onChange, patientId, t, timeline }: AiComparisonProps) {
  const id = useId();
  const pair = orderPair(timeline.items, earlierId, laterId);
  const measures = availableMeasures(timeline);
  const comparison = pair ? compareTimelineItems(timeline.measures, pair.later, pair.earlier) : null;
  const optionLabel = (item: TimelineItem) => `${formatDay(item.createdAt, locale)} · ${resultText(item, t)}`;
  const days = pair ? daysBetween(pair.earlier.createdAt, pair.later.createdAt) : 0;

  return (
    <section aria-labelledby={`${id}-title`} className="surface-section overflow-hidden" data-pipeline={timeline.pipeline}>
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
          <Columns2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div>
          <h3 id={`${id}-title`} className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.evolution.compare.title")}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.evolution.compare.subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        {([
          ["earlier", earlierId, (value: string) => onChange({ earlierId: value, laterId })],
          ["later", laterId, (value: string) => onChange({ earlierId, laterId: value })],
        ] as const).map(([which, value, change]) => (
          <label key={which} className="space-y-1.5" htmlFor={`${id}-${which}`}>
            <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t(`aiAnalyses.evolution.compare.${which}`)}</span>
            <select id={`${id}-${which}`} className={fieldClass} value={value} onChange={(event) => change(event.target.value)}>
              {timeline.items.map((item) => <option key={item.runId} value={item.runId}>{optionLabel(item)}</option>)}
            </select>
          </label>
        ))}
      </div>

      {!pair || !comparison ? (
        <p role="status" className="border-t border-[var(--line)] px-4 py-4 text-sm text-[var(--ink-soft)] sm:px-5">{t("aiAnalyses.evolution.compare.same")}</p>
      ) : (
        <>
          <div className="grid gap-4 border-t border-[var(--line)] p-4 md:grid-cols-2 sm:p-5">
            <Pane heading={t("aiAnalyses.evolution.compare.earlier")} item={pair.earlier} locale={locale} patientId={patientId} pipeline={timeline.pipeline} t={t} />
            <Pane heading={t("aiAnalyses.evolution.compare.later")} item={pair.later} locale={locale} patientId={patientId} pipeline={timeline.pipeline} t={t} />
          </div>

          <div className="space-y-3 border-t border-[var(--line)] p-4 sm:p-5">
            {comparison.reliable ? (
              <p data-reliability="reliable" className="flex items-start gap-2 text-xs leading-5 text-[var(--success-ink)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                {t("aiAnalyses.evolution.compare.reliable")}
              </p>
            ) : (
              <div data-reliability="unreliable" role="note" className="rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-4 py-3 text-[var(--warning-ink)]">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlert className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  {t("aiAnalyses.evolution.compare.unreliableTitle")}
                </p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-5">
                  {comparison.caveats.map((caveat) => <li key={caveat} data-caveat={caveat}>{t(`aiAnalyses.evolution.caveats.${caveat}`)}</li>)}
                </ul>
              </div>
            )}

            {hasAreaMeasures(timeline.pipeline) ? (
              <p role="note" className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-soft)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
                {t("aiAnalyses.evolution.warning2d")}
              </p>
            ) : null}

            <p className="text-xs text-[var(--ink-soft)]">
              {comparison.labelChanged
                ? t("aiAnalyses.evolution.compare.resultChanged", { from: resultText(pair.earlier, t), to: resultText(pair.later, t) })
                : resultText(pair.later, t) === "—"
                  ? t("aiAnalyses.evolution.compare.resultNone")
                  : t("aiAnalyses.evolution.compare.resultSame", { label: resultText(pair.later, t) })}
              {" · "}
              {days === 0 ? t("aiAnalyses.evolution.compare.sameDay") : t("aiAnalyses.evolution.compare.elapsed", { count: days })}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">{t("aiAnalyses.evolution.compare.differences")}</caption>
                <thead className="bg-[var(--panel-soft)]">
                  <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("aiAnalyses.evolution.compare.columns.measure")}</th>
                    {(["earlier", "later", "change", "percent"] as const).map((column) => (
                      <th key={column} scope="col" className="px-3 py-2.5 text-end font-semibold">{t(`aiAnalyses.evolution.compare.columns.${column}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line-soft)]">
                  {measures.map((measure) => (
                    <tr key={measure.key} data-measure={measure.key} className="transition hover:bg-[var(--panel-soft)]">
                      <th scope="row" className="px-3 py-3 text-start font-medium text-[var(--ink)]">{t(`aiAnalyses.evolution.measures.${measure.key}`)}</th>
                      <td className={`px-3 py-3 text-end ${MONO}`}><bdi dir="ltr">{formatMeasure(pair.earlier.measures[measure.key] ?? null, measure.unit, locale)}</bdi></td>
                      <td className={`px-3 py-3 text-end ${MONO}`}><bdi dir="ltr">{formatMeasure(pair.later.measures[measure.key] ?? null, measure.unit, locale)}</bdi></td>
                      <td className={`px-3 py-3 text-end font-semibold ${MONO}`}><bdi dir="ltr">{formatDelta(comparison.deltas[measure.key], measure.unit, locale)}</bdi></td>
                      <td className={`px-3 py-3 text-end ${MONO}`}><bdi dir="ltr">{formatPercentChange(comparison.deltas[measure.key], locale)}</bdi></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

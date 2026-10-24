import { useId } from "react";

import {
  formatDay,
  formatMeasure,
  type MeasureChart,
  type MeasureInfo,
} from "@/features/ai-analyses/ai-timeline";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

const WIDTH = 760;
const HEIGHT = 280;
const MARGIN = { bottom: 44, left: 84, right: 26, top: 20 };
const PLOT = { height: HEIGHT - MARGIN.top - MARGIN.bottom, width: WIDTH - MARGIN.left - MARGIN.right };
const COLOR = "#1f6f5c";
/** Dates are written under every point up to this many, then under the first and the last only. */
const MAX_LABELLED_POINTS = 8;

type AiMeasureChartProps = {
  chart: MeasureChart;
  locale: Locale;
  /** The name of the measure, as the reader knows it. */
  measureName: string;
  measure: MeasureInfo;
  t: TranslationFunction;
};

// One measure over time, the dates at their real distance from each other. A
// comparison that cannot be trusted (another model, no pixel spacing, another
// source) is drawn dashed, with a hollow point: it is shown, never believed
// silently. The table below carries the same figures as text.
export function AiMeasureChart({ chart, locale, measure, measureName, t }: AiMeasureChartProps) {
  const id = useId();
  const x = (ratio: number) => MARGIN.left + ratio * PLOT.width;
  const y = (ratio: number) => MARGIN.top + (1 - ratio) * PLOT.height;
  const { points } = chart;
  const labelAll = points.length <= MAX_LABELLED_POINTS;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="space-y-3">
      {/* A time axis reads left to right, whatever the language. */}
      <div dir="ltr" className="overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[32rem] text-[var(--ink-soft)]"
        >
          <title id={`${id}-title`}>{t("aiAnalyses.evolution.chart.title")}</title>
          <desc id={`${id}-desc`}>
            {t("aiAnalyses.evolution.chart.summary", {
              count: points.length,
              from: formatDay(first.createdAt, locale),
              measure: measureName,
              to: formatDay(last.createdAt, locale),
            })}
          </desc>

          {chart.ticks.map((tick, index) => {
            const ratio = chart.max === chart.min ? 0.5 : (tick - chart.min) / (chart.max - chart.min);
            return (
              <g key={index}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={y(ratio)}
                  y2={y(ratio)}
                  stroke="var(--line, #d8dee4)"
                  strokeDasharray={index === 0 ? undefined : "3 4"}
                />
                <text x={MARGIN.left - 8} y={y(ratio) + 4} textAnchor="end" fontSize={11} fill="currentColor">
                  {formatMeasure(tick, measure.unit, locale)}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            if (!labelAll && point !== first && point !== last) return null;
            return (
              <text key={point.runId} x={x(point.x)} y={HEIGHT - 20} textAnchor={index === 0 && points.length > 1 ? "start" : index === points.length - 1 && points.length > 1 ? "end" : "middle"} fontSize={11} fill="currentColor">
                {formatDay(point.createdAt, locale, "short")}
              </text>
            );
          })}

          {points.slice(1).map((point, index) => (
            <line
              key={`${points[index].runId}-${point.runId}`}
              data-segment={point.unreliable ? "unreliable" : "reliable"}
              x1={x(points[index].x)}
              x2={x(point.x)}
              y1={y(points[index].y)}
              y2={y(point.y)}
              stroke={COLOR}
              strokeDasharray={point.unreliable ? "6 5" : undefined}
              strokeWidth={2}
            />
          ))}

          {points.map((point) => (
            <g key={point.runId} data-point={point.unreliable ? "unreliable" : "reliable"}>
              <circle
                cx={x(point.x)}
                cy={y(point.y)}
                r={5}
                fill={point.unreliable ? "var(--panel, #fff)" : COLOR}
                stroke={COLOR}
                strokeWidth={2}
              />
              {/* One string: React refuses several children in a <title>. */}
              <title>
                {t(point.unreliable ? "aiAnalyses.evolution.chart.pointUnreliable" : "aiAnalyses.evolution.chart.point", {
                  date: formatDay(point.createdAt, locale),
                  value: formatMeasure(point.value, measure.unit, locale),
                })}
              </title>
            </g>
          ))}
        </svg>
      </div>
      {points.some((point) => point.unreliable) ? (
        <p className="text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.evolution.chart.dashedLegend")}</p>
      ) : null}
    </div>
  );
}

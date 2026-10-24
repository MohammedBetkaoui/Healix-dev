import { useId } from "react";

import {
  type ChartData,
  formatPercent,
  lineSegments,
  modelName,
  monthLabel,
} from "@/features/ai-analyses/model-monitoring";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

const WIDTH = 760;
const HEIGHT = 300;
const MARGIN = { bottom: 46, left: 58, right: 26, top: 20 };
const PLOT = {
  height: HEIGHT - MARGIN.top - MARGIN.bottom,
  width: WIDTH - MARGIN.left - MARGIN.right,
};
const TICKS = 4;

// Colour is never the only thing telling the models apart: each one also has
// its own dash and its own marker.
const SERIES_STYLES = [
  { color: "#1f6f5c", dash: undefined, shape: "circle" },
  { color: "#2f5d9e", dash: "7 4", shape: "square" },
  { color: "#a8561a", dash: "2 3", shape: "diamond" },
  { color: "#7a4d9e", dash: "10 4 2 4", shape: "triangle" },
  { color: "#4d6b1f", dash: "1 5", shape: "circle" },
] as const;

type SeriesStyle = (typeof SERIES_STYLES)[number];

function Marker({ cx, cy, style }: { cx: number; cy: number; style: SeriesStyle }) {
  const common = { fill: style.color, stroke: "var(--panel, #fff)", strokeWidth: 1.5 };
  switch (style.shape) {
    case "square":
      return <rect {...common} x={cx - 4.5} y={cy - 4.5} width={9} height={9} />;
    case "diamond":
      return <polygon {...common} points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`} />;
    case "triangle":
      return <polygon {...common} points={`${cx},${cy - 6} ${cx + 5.5},${cy + 4.5} ${cx - 5.5},${cy + 4.5}`} />;
    default:
      return <circle {...common} cx={cx} cy={cy} r={4.5} />;
  }
}

type CorrectionRateChartProps = {
  data: ChartData;
  locale: Locale;
  t: TranslationFunction;
};

// The correction rate of each model, month after month. The monthly tables
// below carry the same figures as text: the curve is a way in, not the only one.
export function CorrectionRateChart({ data, locale, t }: CorrectionRateChartProps) {
  const id = useId();
  const x = (ratio: number) => MARGIN.left + ratio * PLOT.width;
  const y = (ratio: number) => MARGIN.top + (1 - ratio) * PLOT.height;
  // Every month up to 12 of them, then every other one, then every third.
  const labelStep = Math.ceil(data.months.length / 12);
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => index / TICKS);
  const summary = t("aiAnalyses.monitoring.chart.summary", {
    max: formatPercent(data.yMax, locale),
    models: data.series.length,
    months: data.months.length,
  });

  return (
    <div className="space-y-4">
      {/* A time axis reads left to right, whatever the language. */}
      <div dir="ltr" className="overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[34rem] text-[var(--ink-soft)]"
        >
          <title id={`${id}-title`}>{t("aiAnalyses.monitoring.chart.title")}</title>
          <desc id={`${id}-desc`}>{summary}</desc>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--line, #d8dee4)"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="currentColor">
                {formatPercent(tick * data.yMax, locale)}
              </text>
            </g>
          ))}
          <text
            transform={`translate(14 ${MARGIN.top + PLOT.height / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
          >
            {t("aiAnalyses.monitoring.chart.yAxis")}
          </text>

          {data.months.map((month, index) => {
            if (index % labelStep !== 0) return null;
            const ratio = data.months.length === 1 ? 0.5 : index / (data.months.length - 1);
            return (
              <text key={month} x={x(ratio)} y={HEIGHT - 20} textAnchor="middle" fontSize={11} fill="currentColor">
                {monthLabel(month, locale, "short")}
              </text>
            );
          })}

          {data.series.map((series, index) => {
            const style = SERIES_STYLES[index % SERIES_STYLES.length];
            const name = modelName(series.entry.modelId, t);

            return (
              <g key={series.key} data-series={series.key}>
                {lineSegments(series.points).map((segment) =>
                  segment.length > 1 ? (
                    <polyline
                      key={segment[0].month}
                      fill="none"
                      points={segment.map((point) => `${x(point.x)},${y(point.y as number)}`).join(" ")}
                      stroke={style.color}
                      strokeDasharray={style.dash}
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  ) : null,
                )}
                {series.points.map((point) =>
                  point.y === null ? null : (
                    <g key={point.month} data-drift={point.drift ? "true" : undefined}>
                      {point.drift ? (
                        <circle cx={x(point.x)} cy={y(point.y)} r={10} fill="none" stroke="var(--warning, #b45309)" strokeWidth={2.5} />
                      ) : null}
                      <Marker cx={x(point.x)} cy={y(point.y)} style={style} />
                      {/* One string: React refuses several children in a <title>. */}
                      <title>
                        {`${t("aiAnalyses.monitoring.chart.point", {
                          corrected: point.corrected,
                          judged: point.judged,
                          model: name,
                          month: monthLabel(point.month, locale),
                          rate: formatPercent(point.rate, locale),
                        })}${point.drift ? ` · ${t("aiAnalyses.monitoring.chart.driftPoint")}` : ""}`}
                      </title>
                    </g>
                  ),
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ul aria-label={t("aiAnalyses.monitoring.chart.legend")} className="flex flex-wrap gap-x-5 gap-y-2">
        {data.series.map((series, index) => {
          const style = SERIES_STYLES[index % SERIES_STYLES.length];
          return (
            <li key={series.key} className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]">
              <svg width={34} height={14} aria-hidden="true">
                <line x1={2} x2={32} y1={7} y2={7} stroke={style.color} strokeDasharray={style.dash} strokeWidth={2} />
                <Marker cx={17} cy={7} style={style} />
              </svg>
              <bdi>{modelName(series.entry.modelId, t)}</bdi>
              <span className="font-normal text-[var(--ink-faint)]">
                <bdi>{t(`aiAnalyses.pipelines.${series.entry.pipeline}.name`)}</bdi>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
